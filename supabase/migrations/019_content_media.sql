-- ============================================================================
-- Migration 019: content_media tablosu repo'ya alinmasi
-- ============================================================================
--
-- BAGLAM: content_media tablosu Supabase Dashboard'da elle yaratilmisti
-- (mig drift). Bu dosya tabloyu repo'ya tasir.
--
-- ETKI: Mevcut tabloyu ve datayı BOZMAZ. Tum islemler idempotent:
--   - CREATE TABLE IF NOT EXISTS
--   - ADD COLUMN IF NOT EXISTS
--   - CREATE INDEX IF NOT EXISTS
--   - DROP POLICY IF EXISTS + CREATE POLICY
--   - CHECK constraint icin pg_constraint kontrol
--
-- FK karari (Sprint 4 teshis raporu): Polimorfik tasarim korunur,
-- content_id'de gercek FK YOK. CHECK constraint ile content_type
-- degerleri sinirlanir.
--
-- KRITIK: "content_media_public_read" policy bu migration'da ILK KEZ
-- repo'ya giriyor. Anon kullanicilarin public galeri okumasi buna bagli
-- (Dashboard'da elle vardi, repo'ya simdi alindi).
--
-- 009 migration content_media'ya tenant_id ekledi (target_tables'ta var,
-- §5d satır 115). Bu dosyada tenant_id koşullu eklenir (fresh DB icin),
-- mevcut DB'de no-op olur.
-- ============================================================================

-- 1) Tablo (yoksa yarat — Dashboard-created tablo varsa atlanir)
CREATE TABLE IF NOT EXISTS public.content_media (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_type TEXT NOT NULL,
  content_id UUID NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image',
  url TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2) tenant_id kolonu (009 ile eklendi; fresh DB icin guvence)
ALTER TABLE public.content_media
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- NOT NULL: 009 zaten data doldurup SET NOT NULL yapti. Burada
-- eklemiyoruz cunku fresh DB'de bu migration sirayli calistirilirsa
-- (019 sirasinda data olmayabilir). Mevcut DB'de zaten NOT NULL durumda.

-- 3) CHECK constraint'ler (polimorfik tasarim — Senior karar A)
-- Postgres'te ADD CONSTRAINT IF NOT EXISTS yok, pg_constraint kontrolu sart.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_media_content_type_check'
  ) THEN
    ALTER TABLE public.content_media
      ADD CONSTRAINT content_media_content_type_check
      CHECK (content_type IN ('news', 'announcement', 'page', 'headline'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'content_media_media_type_check'
  ) THEN
    ALTER TABLE public.content_media
      ADD CONSTRAINT content_media_media_type_check
      CHECK (media_type IN ('image', 'video'));
  END IF;
END $$;

-- 4) Index'ler
-- Yeni: bileşik lookup index (en yaygin sorgu pattern'i)
CREATE INDEX IF NOT EXISTS idx_content_media_lookup
  ON public.content_media (content_type, content_id);

-- 009'da zaten eklenmis, defansif IF NOT EXISTS ile cakismaz
CREATE INDEX IF NOT EXISTS idx_content_media_tenant
  ON public.content_media (tenant_id);

-- 5) RLS enable
ALTER TABLE public.content_media ENABLE ROW LEVEL SECURITY;

-- 6) Policy'ler
-- ESKI Dashboard-created policy'leri temizle (varsa)
DROP POLICY IF EXISTS "Public read media" ON public.content_media;
DROP POLICY IF EXISTS "Auth full access media" ON public.content_media;

-- YENI tutarlı isimli policy'leri kur
DROP POLICY IF EXISTS "content_media_public_read" ON public.content_media;
DROP POLICY IF EXISTS "tenant_content_media_all" ON public.content_media;

-- Public read (anon) — public galeri icin KRITIK
-- 012'de bu policy YOKTU, sadece Dashboard'da vardi. Simdi repo'ya giriyor.
CREATE POLICY "content_media_public_read" ON public.content_media
  FOR SELECT
  USING (true);

-- Tenant-aware authenticated (012 ile uyumlu)
CREATE POLICY "tenant_content_media_all" ON public.content_media
  FOR ALL
  TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- ============================================================================
-- Migration 019 sonu
-- ============================================================================
