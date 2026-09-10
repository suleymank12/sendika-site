-- ============================================================================
-- Migration 025: homepage_sections + homepage_section_items repo'ya alinmasi
-- ============================================================================
--
-- BAGLAM (Tur 2 performans denetimi, bulgu b5): Bu iki tablo Supabase
-- Dashboard'da elle yaratilmisti (mig drift — 009:19-21 bunu belgeliyor,
-- calistirilan DDL admin/anasayfa-bolumleri/page.tsx:1-33 yorumunda duruyor).
-- Sifirdan kurulan bir DB'de tablolar OLUSMUYORDU: 005 icon kolonunu
-- eklerken, 012 policy yaratirken hata verir; anasayfa bolumleri calismaz.
-- Bu dosya 019'daki content_media emsalini izleyerek tablolari repo'ya alir.
--
-- SEMANIN KAYNAGI (29 Temmuz 2026'da canli DB'den birebir okundu):
--   - Kolon/tip/default/NOT NULL: PostgREST OpenAPI semasi (canli)
--   - FK ve policy tanimlari: Dashboard'da calistirilan DDL yorumu
--     (admin/anasayfa-bolumleri/page.tsx:1-33) + 005/009/012 izleri
--   - Canli davranis probu: anon SELECT calisiyor (public policy mevcut)
--
-- ETKI: Mevcut tabloyu ve datayi BOZMAZ. Tum islemler idempotent:
--   - CREATE TABLE IF NOT EXISTS (canli DB'de no-op)
--   - ADD COLUMN IF NOT EXISTS (no-op)
--   - CREATE INDEX IF NOT EXISTS (no-op)
--   - DROP POLICY IF EXISTS + CREATE POLICY (ayni semantik, tutarli isim)
--   Canli DB'de tek gorunur degisiklik: public policy'lerin ISMI
--   Dashboard'daki "Public read active sections/section items"tan repo
--   standardina ("homepage_*_public_read") gecer. Predicate AYNEN
--   is_active = true kalir — erisim genislemez/daralmaz.
--
-- SIFIRDAN KURULUM SIRASI (onemli):
--   Migration'lar 001'den itibaren sirayla uygulanirken bu dosya 004'ten
--   SONRA (005'ten once) BIR KEZ erken calistirilmali, sonra sirasi
--   geldiginde normal sekilde TEKRAR calistirilmalidir (iki kosum da
--   guvenli — idempotent). Erken kosumda tenants tablosu henuz olmadigi
--   icin tenant_id/tenant-policy bloklari NOTICE ile atlanir; onlari
--   zaten 009 (kolon+index) ve 012 (policy) sirasi gelince tamamlar.
--   Mevcut CANLI DB'de tek kosum yeterlidir.
--
-- INDEX NOTU: Yalnizca canlida zaten var olan idx_*_tenant garanti
-- edilir. homepage_section_items(section_id) index'i BILEREK yok —
-- performans index'leri ayri is (Tur 2 teshis, madde b4).
-- ============================================================================

-- 1) Tablolar (yoksa yarat — Dashboard-created tablolar varsa atlanir)
CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  section_type TEXT NOT NULL DEFAULT 'custom',
  source TEXT DEFAULT 'custom',
  item_count INTEGER DEFAULT 4,
  layout TEXT DEFAULT 'grid-4',
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.homepage_section_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- Admin UI silmede CASCADE'e guvenir ("Bagli tum ogeler de silinecektir",
  -- anasayfa-bolumleri/page.tsx:303-311 + 492)
  section_id UUID REFERENCES public.homepage_sections(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  link_url TEXT,
  icon TEXT,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) icon kolonu (canlida 005 ekledi; DDL yorumundan kurulmus olasi bir
-- tabloda eksik olabilir — defansif, no-op beklenir)
ALTER TABLE public.homepage_section_items
  ADD COLUMN IF NOT EXISTS icon TEXT;

-- 3) tenant_id kolonu + index (009'un a-b-c-d deseni; canli DB'de tamamen
-- no-op). tenants tablosu yoksa (sifirdan kurulumda erken kosum) atlanir —
-- 009 sirasi gelince ayni isi kendisi yapar.
DO $$
DECLARE
  t TEXT;
  has_nulls BOOLEAN;
  default_tenant CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'tenants'
  ) THEN
    RAISE NOTICE 'tenants tablosu yok (erken kosum) — tenant_id blogu atlandi, 009 tamamlayacak.';
    RETURN;
  END IF;

  FOREACH t IN ARRAY ARRAY['homepage_sections', 'homepage_section_items'] LOOP
    -- a) Kolon (idempotent)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE',
      t
    );

    -- b) Backfill (yalnizca default tenant gercekten varsa — FK ihlali olmasin)
    IF EXISTS (SELECT 1 FROM public.tenants WHERE id = default_tenant) THEN
      EXECUTE format(
        'UPDATE public.%I SET tenant_id = %L WHERE tenant_id IS NULL',
        t, default_tenant
      );
    END IF;

    -- c) NOT NULL (yalnizca NULL satir kalmadiysa — canli DB'de zaten NOT NULL)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t
        AND column_name = 'tenant_id' AND is_nullable = 'YES'
    ) THEN
      RAISE NOTICE '%.tenant_id zaten NOT NULL', t;
    ELSE
      -- NOT: EXECUTE, FOUND degiskenini set etmez — sonuc INTO ile alinir.
      EXECUTE format(
        'SELECT EXISTS (SELECT 1 FROM public.%I WHERE tenant_id IS NULL)', t
      ) INTO has_nulls;
      IF NOT has_nulls THEN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
      ELSE
        RAISE NOTICE '%.tenant_id NULL satirlar var — SET NOT NULL atlandi', t;
      END IF;
    END IF;

    -- d) Index (009 loop'u canlida zaten ekledi)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id)',
      'idx_' || t || '_tenant', t
    );
  END LOOP;
END $$;

-- 4) RLS enable (zaten acik ise no-op)
ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homepage_section_items ENABLE ROW LEVEL SECURITY;

-- 5) Public SELECT policy'leri
-- Eski Dashboard isimlerini temizle, repo standardinda yeniden kur.
-- Predicate canli davranisla BIREBIR ayni: is_active = true
-- (001'deki "sadece aktif icerik" deseni; erisim genislemez).
DROP POLICY IF EXISTS "Public read active sections" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections_public_read" ON public.homepage_sections;
CREATE POLICY "homepage_sections_public_read" ON public.homepage_sections
  FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Public read active section items" ON public.homepage_section_items;
DROP POLICY IF EXISTS "homepage_section_items_public_read" ON public.homepage_section_items;
CREATE POLICY "homepage_section_items_public_read" ON public.homepage_section_items
  FOR SELECT
  USING (is_active = true);

-- 6) Tenant-aware authenticated policy'ler (012 ile ayni tanim/isim).
-- user_has_tenant_access fonksiyonu yoksa (sifirdan kurulumda erken kosum)
-- atlanir — 012 sirasi gelince ayni policy'leri kendisi kurar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'user_has_tenant_access'
  ) THEN
    RAISE NOTICE 'user_has_tenant_access yok (erken kosum) — tenant policy blogu atlandi, 012 tamamlayacak.';
    RETURN;
  END IF;

  -- 012 oncesi Dashboard isimleri (canlida 012 zaten dusurdu — defansif)
  EXECUTE 'DROP POLICY IF EXISTS "Auth full access sections" ON public.homepage_sections';
  EXECUTE 'DROP POLICY IF EXISTS "Auth full access section items" ON public.homepage_section_items';

  EXECUTE 'DROP POLICY IF EXISTS "tenant_homepage_sections_all" ON public.homepage_sections';
  EXECUTE 'CREATE POLICY "tenant_homepage_sections_all" ON public.homepage_sections
    FOR ALL TO authenticated
    USING (public.user_has_tenant_access(tenant_id))
    WITH CHECK (public.user_has_tenant_access(tenant_id))';

  EXECUTE 'DROP POLICY IF EXISTS "tenant_homepage_section_items_all" ON public.homepage_section_items';
  EXECUTE 'CREATE POLICY "tenant_homepage_section_items_all" ON public.homepage_section_items
    FOR ALL TO authenticated
    USING (public.user_has_tenant_access(tenant_id))
    WITH CHECK (public.user_has_tenant_access(tenant_id))';
END $$;

-- ============================================================================
-- DOGRULAMA (apply sonrasi elle calistirin)
-- ============================================================================
-- (a) Tablolar ve kolonlar:
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_schema = 'public'
--     AND table_name IN ('homepage_sections', 'homepage_section_items')
--   ORDER BY table_name, ordinal_position;
--   -- Beklenen: sections 10 kolon, items 11 kolon; tenant_id NOT NULL (NO).
--
-- (b) Policy'ler (tablo basina 2: public_read + tenant_all):
--   SELECT tablename, policyname, cmd, qual
--   FROM pg_policies
--   WHERE tablename IN ('homepage_sections', 'homepage_section_items')
--   ORDER BY tablename, policyname;
--   -- Eski "Public read active ..." isimleri GORUNMEMELI.
--
-- (c) Index'ler:
--   SELECT tablename, indexname FROM pg_indexes
--   WHERE tablename IN ('homepage_sections', 'homepage_section_items');
--   -- Beklenen: *_pkey + idx_homepage_sections_tenant + idx_homepage_section_items_tenant
--
-- (d) Anon erisim davranisi degismedi (public anasayfa regresyonu):
--   BEGIN; SET LOCAL ROLE anon;
--   SELECT count(*) FROM public.homepage_sections;        -- yalnizca aktifler
--   SELECT count(*) FROM public.homepage_section_items;   -- yalnizca aktifler
--   ROLLBACK;
--
-- (e) Uygulama regresyonu: public anasayfa bolumleri + /bolum/[id] +
--   admin "Anasayfa Bolumleri" sayfasi (listeleme, ekleme, silme).
--
-- ============================================================================
-- ROLLBACK (yalnizca policy isimlendirmesini geri alir)
-- ============================================================================
-- DIKKAT: Tablolar bu migration'dan ONCE de canli DB'de vardi ve icinde
-- gercek veri var. DROP TABLE rollback'e BILEREK dahil DEGIL.
--
-- DROP POLICY IF EXISTS "homepage_sections_public_read" ON public.homepage_sections;
-- CREATE POLICY "Public read active sections" ON public.homepage_sections
--   FOR SELECT USING (is_active = true);
-- DROP POLICY IF EXISTS "homepage_section_items_public_read" ON public.homepage_section_items;
-- CREATE POLICY "Public read active section items" ON public.homepage_section_items
--   FOR SELECT USING (is_active = true);
-- ============================================================================
-- Migration 025 sonu
-- ============================================================================
