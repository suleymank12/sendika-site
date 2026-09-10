-- ============================================================================
-- Migration 021: contact_messages + contact_rate_limit
-- ============================================================================
-- FAZ 1: Iletisim formu backend'i (DB kaydi + admin okuma)
--
-- Bu migration ne yapar?
--  - contact_messages: ziyaretcilerin iletisim formu mesajlari (tenant-scoped)
--  - contact_rate_limit: DB-tabanli rate limit kayitlari (ip_hash — ham IP DEGIL)
--
-- GUVENLIK (KRITIK — bu proje icin ILK public-write):
--  - Anon kullaniciya contact_messages'a DOGRUDAN yazma izni VERILMEZ.
--    Kayit /api/contact route'unda service role ile yapilir (RLS bypass).
--    Boylece anon INSERT policy YOK; tum yazma tek kontrollu noktadan
--    (honeypot + rate limit + validation + hostname-tabanli tenant) gecer.
--  - Public SELECT policy de YOK — mesajlar gizlidir, kimse okuyamaz.
--  - contact_rate_limit yalnizca service role tarafindan gorulur/yazilir
--    (hicbir public/authenticated policy yok; RLS acik + policy'siz = kilitli).
--
-- ETKI: Idempotent (CREATE TABLE IF NOT EXISTS, pg_constraint kontrolu,
--   DROP POLICY IF EXISTS + CREATE). Mevcut migration pattern'ine (019) uyar.
--   Elle apply modeli — Supabase SQL Editor'dan calistirilir.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) contact_messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ad         TEXT NOT NULL,
  email      TEXT NOT NULL,
  telefon    TEXT NOT NULL,
  mesaj      TEXT NOT NULL,
  okundu     BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- CHECK constraint'ler (DB seviyesinde payload/abuse savunmasi).
-- Postgres'te "ADD CONSTRAINT IF NOT EXISTS" yok → pg_constraint kontrolu sart.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_ad_len') THEN
    ALTER TABLE public.contact_messages
      ADD CONSTRAINT contact_messages_ad_len CHECK (char_length(ad) BETWEEN 1 AND 100);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_email_len') THEN
    ALTER TABLE public.contact_messages
      ADD CONSTRAINT contact_messages_email_len CHECK (char_length(email) BETWEEN 3 AND 150);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_telefon_len') THEN
    ALTER TABLE public.contact_messages
      ADD CONSTRAINT contact_messages_telefon_len CHECK (char_length(telefon) BETWEEN 1 AND 30);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contact_messages_mesaj_len') THEN
    ALTER TABLE public.contact_messages
      ADD CONSTRAINT contact_messages_mesaj_len CHECK (char_length(mesaj) BETWEEN 1 AND 2000);
  END IF;
END $$;

-- Index'ler
-- Liste sorgusu (tenant basina, en yeni once):
CREATE INDEX IF NOT EXISTS idx_contact_messages_tenant_created
  ON public.contact_messages (tenant_id, created_at DESC);
-- Okunmamis sayaci (badge):
CREATE INDEX IF NOT EXISTS idx_contact_messages_tenant_okundu
  ON public.contact_messages (tenant_id, okundu);

-- RLS
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anon/public INSERT policy YOK (kayit service role ile /api/contact'ta).
-- Public SELECT policy YOK (mesajlar gizli — kimse okuyamaz).

-- Admin: tenant-scoped tam CRUD (012 pattern'i ile birebir).
-- user_has_tenant_access super admin bypass'ini icerir (012).
DROP POLICY IF EXISTS "tenant_contact_messages_all" ON public.contact_messages;
CREATE POLICY "tenant_contact_messages_all" ON public.contact_messages
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- ============================================================================
-- 2) contact_rate_limit
-- ============================================================================
-- DB-tabanli rate limit (kalici — VPS/serverless restart'tan etkilenmez).
-- Ham IP SAKLANMAZ: API route'ta IP + salt ile SHA-256 hash'lenip ip_hash
-- olarak yazilir (gizlilik/KVKK). Yine de rate limit calisir (deterministik).
CREATE TABLE IF NOT EXISTS public.contact_rate_limit (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  ip_hash    TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate limit sorgusu: (tenant_id, ip_hash) + son 1 saat penceresi
CREATE INDEX IF NOT EXISTS idx_contact_rate_limit_lookup
  ON public.contact_rate_limit (tenant_id, ip_hash, created_at);

-- RLS: hicbir public/authenticated policy yok → yalnizca service role erisir.
-- NOT: Bu tablo zamanla buyur; eski kayitlar (>1 saat) icin periyodik
-- temizlik (cron/scheduled) ilerideki bir adimda eklenmeli.
ALTER TABLE public.contact_rate_limit ENABLE ROW LEVEL SECURITY;

COMMIT;

-- ============================================================================
-- Migration 021 sonu
-- ============================================================================
