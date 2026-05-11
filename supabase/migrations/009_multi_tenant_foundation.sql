-- ============================================================
-- 009_multi_tenant_foundation.sql
-- FAZ 1: Multi-tenant veritabanı temeli
--
-- Bu migration ne yapar?
--  - tenants ve tenant_users tablolarını oluşturur
--  - Varsayılan (default) bir tenant kaydı ekler
--  - Tüm içerik tablolarına tenant_id kolonu ekler ve mevcut
--    verileri default tenant'a bağlar
--  - Slug ve site_settings.key gibi global UNIQUE kısıtları
--    composite UNIQUE'e (tenant_id ile birlikte) çevirir
--  - tenants/tenant_users için temel RLS politikaları kurar
--
-- ÖNEMLİ:
--  - Migration idempotent'tir; tekrar çalıştırılabilir
--  - Mevcut veri KAYBI YOK; tüm satırlar default tenant'a bağlanır
--  - Diğer tabloların mevcut RLS politikalarına BU FAZDA dokunulmaz;
--    tenant-aware RLS sonraki fazda yazılacak
--  - homepage_sections, homepage_section_items, content_media
--    tabloları kayıtlı bir migration'da CREATE edilmediği için
--    işlemler DO bloğu ile EXISTS kontrolü altında çalışır
-- ============================================================

-- pgcrypto: gen_random_uuid() için (Supabase'de genelde aktiftir)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1) ORTAK: updated_at trigger fonksiyonu (idempotent)
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2) TENANTS TABLOSU
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,             -- subdomain (sendika-a, dernek-b ...)
  custom_domain TEXT UNIQUE,             -- ileride kendi alan adı bağlanırsa
  logo_url TEXT,
  favicon_url TEXT,
  is_active BOOLEAN DEFAULT true,
  plan TEXT DEFAULT 'basic',             -- ileride plan/abonelik sistemi
  enabled_modules JSONB DEFAULT '{"donations": false, "membership": false}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- tenants için updated_at trigger
DROP TRIGGER IF EXISTS trg_tenants_updated_at ON tenants;
CREATE TRIGGER trg_tenants_updated_at
BEFORE UPDATE ON tenants
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_timestamp();

-- ============================================================
-- 3) TENANT_USERS TABLOSU (bir kullanıcı birden çok tenant'a bağlı olabilir)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'admin',             -- admin, editor, viewer
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user   ON tenant_users(user_id);

-- ============================================================
-- 4) VARSAYILAN TENANT
-- Mevcut tüm veriyi bu kayda bağlayacağız.
-- ============================================================
INSERT INTO tenants (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Varsayılan Site', 'default')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 5) İÇERİK TABLOLARINA tenant_id KOLONU EKLE
--    Her tablo için:
--      a) ADD COLUMN IF NOT EXISTS tenant_id ... REFERENCES tenants(id)
--      b) UPDATE ... SET tenant_id = default WHERE tenant_id IS NULL
--      c) ALTER COLUMN tenant_id SET NOT NULL
--      d) CREATE INDEX IF NOT EXISTS idx_{tablo}_tenant
--
--    homepage_sections / homepage_section_items / content_media
--    tabloları yoksa bu adımlar atlanır (NOTICE üretir).
-- ============================================================
DO $$
DECLARE
  t TEXT;
  default_tenant CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  target_tables CONSTANT TEXT[] := ARRAY[
    'news',
    'announcements',
    'menu_items',
    'sliders',
    'pages',
    'board_members',
    'branches',
    'gallery_albums',
    'gallery_images',
    'site_settings',
    'headlines',
    'homepage_sections',
    'homepage_section_items',
    'news_categories',
    'content_media'
  ];
BEGIN
  FOREACH t IN ARRAY target_tables LOOP
    -- Tablo var mı?
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Tablo bulunamadı, atlanıyor: %', t;
      CONTINUE;
    END IF;

    -- a) Kolonu ekle (idempotent)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE',
      t
    );

    -- b) Mevcut satırları default tenant'a bağla
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL',
      t, default_tenant
    );

    -- c) NOT NULL yap (zaten NOT NULL ise hata vermez, SET NOT NULL idempotent)
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL',
      t
    );

    -- d) Performans indexi
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
      'idx_' || t || '_tenant', t
    );

    RAISE NOTICE 'tenant_id eklendi/güncellendi: %', t;
  END LOOP;
END $$;

-- ============================================================
-- 6) SLUG UNIQUE KISITLARINI COMPOSITE'E ÇEVİR
--    Eski global UNIQUE(slug) kaldırılır; (tenant_id, slug) UNIQUE eklenir.
--    Böylece farklı tenant'lar aynı slug'ı kullanabilir.
-- ============================================================

-- news
ALTER TABLE news DROP CONSTRAINT IF EXISTS news_slug_key;
DROP INDEX IF EXISTS news_slug_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'news_tenant_slug_key'
  ) THEN
    ALTER TABLE news ADD CONSTRAINT news_tenant_slug_key UNIQUE (tenant_id, slug);
  END IF;
END $$;

-- announcements
ALTER TABLE announcements DROP CONSTRAINT IF EXISTS announcements_slug_key;
DROP INDEX IF EXISTS announcements_slug_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'announcements_tenant_slug_key'
  ) THEN
    ALTER TABLE announcements ADD CONSTRAINT announcements_tenant_slug_key UNIQUE (tenant_id, slug);
  END IF;
END $$;

-- pages
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_slug_key;
DROP INDEX IF EXISTS pages_slug_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pages_tenant_slug_key'
  ) THEN
    ALTER TABLE pages ADD CONSTRAINT pages_tenant_slug_key UNIQUE (tenant_id, slug);
  END IF;
END $$;

-- news_categories
ALTER TABLE news_categories DROP CONSTRAINT IF EXISTS news_categories_slug_key;
DROP INDEX IF EXISTS news_categories_slug_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'news_categories_tenant_slug_key'
  ) THEN
    ALTER TABLE news_categories ADD CONSTRAINT news_categories_tenant_slug_key UNIQUE (tenant_id, slug);
  END IF;
END $$;

-- ============================================================
-- 7) SITE_SETTINGS: (tenant_id, key) COMPOSITE UNIQUE
--    Her tenant kendi site_title / logo_url / contact_* vb. ayarlarına sahip olur.
-- ============================================================
ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_key_key;
DROP INDEX IF EXISTS site_settings_key_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'site_settings_tenant_key_key'
  ) THEN
    ALTER TABLE site_settings ADD CONSTRAINT site_settings_tenant_key_key UNIQUE (tenant_id, key);
  END IF;
END $$;

-- Eski idx_site_settings_key (yalnız key üzerinde) artık yetersiz; tenant_id + key composite indexi ekle
CREATE INDEX IF NOT EXISTS idx_site_settings_tenant_key ON site_settings(tenant_id, key);

-- ============================================================
-- 8) RLS — sadece tenants ve tenant_users için temel politikalar
--    Diğer tabloların mevcut politikaları sonraki fazda
--    tenant-aware hale getirilecek (bu fazda DOKUNULMAZ).
-- ============================================================

-- tenants
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_public_select"   ON tenants;
DROP POLICY IF EXISTS "tenants_auth_insert"     ON tenants;
DROP POLICY IF EXISTS "tenants_auth_update"     ON tenants;
DROP POLICY IF EXISTS "tenants_auth_delete"     ON tenants;

-- Herkes (anonim dahil) tenants tablosunu okuyabilir
-- (subdomain → tenant lookup için bu zorunlu)
CREATE POLICY "tenants_public_select"
  ON tenants
  FOR SELECT
  USING (true);

-- INSERT/UPDATE/DELETE yalnızca authenticated
CREATE POLICY "tenants_auth_insert"
  ON tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenants_auth_update"
  ON tenants
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenants_auth_delete"
  ON tenants
  FOR DELETE
  TO authenticated
  USING (true);

-- tenant_users
ALTER TABLE tenant_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_users_auth_select" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_auth_insert" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_auth_update" ON tenant_users;
DROP POLICY IF EXISTS "tenant_users_auth_delete" ON tenant_users;

-- tenant_users üzerinde sadece authenticated tam CRUD
CREATE POLICY "tenant_users_auth_select"
  ON tenant_users
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "tenant_users_auth_insert"
  ON tenant_users
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "tenant_users_auth_update"
  ON tenant_users
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "tenant_users_auth_delete"
  ON tenant_users
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- BİTTİ.
-- Bu migration'dan sonra mevcut site (default tenant'a bağlı)
-- aynı şekilde çalışmaya devam etmelidir.
-- Kod tarafı (tenant resolution, query filter, RLS-aware politikalar)
-- sonraki fazlarda eklenecek.
-- ============================================================
