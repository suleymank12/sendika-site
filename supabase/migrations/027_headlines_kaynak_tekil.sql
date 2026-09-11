-- ============================================================================
-- Migration 027: headlines — ayni haber/duyuru iki kez mansete eklenemez
-- ============================================================================
--
-- SORUN (12 Eylul 2026, panel bilgi mimarisi incelemesi):
--   Bir haber/duyuru IKI yoldan manset yapilabiliyor:
--     (1) haber/duyuru editorundeki "Mansete Ekle" kutusu
--     (2) Mansetler sayfasinda "Kaynak: Haber/Duyuru" secimi
--   headlines'ta (tenant_id, source_type, source_id) tekilligi YOKTU;
--   Mansetler sayfasinin kaynak listesi zaten manseti olanlari elemiyordu ve
--   kayit oncesi ayni-kaynak kontrolu de yoktu. Iki sonucu vardi:
--     - ayni haber anasayfada IKI KEZ manset olarak cikabiliyordu
--     - cift kayit editor yolunu BOZUYORDU: senkron maybeSingle() kullaniyor,
--       iki satirda hata doner -> baslik/kapak guncellemesi sessizce yapilamaz
--       (kod tarafi da ayni turda sertlestirildi: order + limit(1))
--
-- COZUM: kismi tekil indeks — YALNIZ kaynakli mansetler.
--   "Ozel" mansette source_id NULL oldugu icin ozel mansetler kapsam disidir;
--   canlida dogrulandi (12 Eylul): custom 1 satir, source_id dolu 0.
--   PostgreSQL tekil indekste NULL'lari birbirinden FARKLI sayar (NULLS
--   DISTINCT varsayilani), yani kosul olmasa da ozel mansetler catismazdi;
--   kismi kosul yine de yazildi: niyet okunur olsun ve indeks kucuk kalsin.
--
-- CANLI OLCUM (12 Eylul 2026, apply oncesi): cift kayit 0, source_type NULL 0,
--   kurum basina manset 3 ve 1 (sinir 10).
--
-- ELLE APPLY: Supabase SQL Editor (NOTE.md "elle apply" modeli). Apply sonrasi
--   dogrulama sorgulari ve rollback dosya sonunda.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) EMNIYET — cift kayit varsa ACIK mesajla dur
-- ----------------------------------------------------------------------------
-- Temizlik bilerek bu dosyaya KONMADI: silinecek satirlar kullanicinin
-- anasayfada gordugu icerik ve hangisinin kalacagi bir karardir (once AKTIF
-- olan, sonra EN ESKI). Temizlik SQL'i + gerekcesi NOTE.md'de. Bu blok
-- olmasaydi asagidaki CREATE UNIQUE INDEX ham "duplicate key" hatasi verir,
-- ne yapilmasi gerektigini soylemezdi.
DO $$
DECLARE cift integer;
BEGIN
  SELECT count(*) INTO cift FROM (
    SELECT 1
    FROM public.headlines
    WHERE source_id IS NOT NULL
    GROUP BY tenant_id, source_type, source_id
    HAVING count(*) > 1
  ) x;

  IF cift > 0 THEN
    RAISE EXCEPTION
      'Once temizlik SQL-ini calistirin: % kaynak icin cift manset kaydi var (NOTE.md -> MANSET TEKILLIGI).', cift;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Kismi tekil indeks
-- ----------------------------------------------------------------------------
-- CONCURRENTLY YOK: tablo cok kucuk (kurum basina <= 10 satir) ve bu dosya tek
-- transaction icinde calisiyor; CONCURRENTLY transaction icinde calismaz.
-- IF NOT EXISTS: dosya ikinci kez calistirilirsa zararsiz (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS headlines_kaynak_tekil
  ON public.headlines (tenant_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

COMMENT ON INDEX public.headlines_kaynak_tekil IS
  'Ayni haber/duyuru bir kurumda iki kez mansete eklenemez (027). Ozel mansetler (source_id NULL) kapsam disi.';

COMMIT;

-- ============================================================================
-- APPLY SONRASI DOGRULAMA — bu sorgulari AYRI AYRI calistirin
-- ============================================================================
--
-- (a) Indeks olustu mu?  -> 1 satir
--     SELECT indexname, indexdef FROM pg_indexes
--     WHERE schemaname = 'public' AND indexname = 'headlines_kaynak_tekil';
--
-- (b) Cift kayit var mi?  -> 0 satir
--     SELECT tenant_id, source_type, source_id, count(*)
--     FROM public.headlines
--     WHERE source_id IS NOT NULL
--     GROUP BY 1, 2, 3
--     HAVING count(*) > 1;
--
-- (c) Kisit GERCEKTEN calisiyor mu? (geri alinir — ROLLBACK ile biter)
--     BEGIN;
--       INSERT INTO public.headlines (tenant_id, title, source_type, source_id, is_active)
--       SELECT tenant_id, title || ' (kopya testi)', source_type, source_id, false
--       FROM public.headlines
--       WHERE source_id IS NOT NULL
--       LIMIT 1;
--       -- BEKLENEN: ERROR: duplicate key value violates unique constraint
--       --           "headlines_kaynak_tekil"
--     ROLLBACK;
--
-- (d) Ozel mansetler etkilenmedi mi? (source_id NULL satirlar cogul olabilir)
--     SELECT count(*) AS ozel_manset FROM public.headlines WHERE source_id IS NULL;
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--     DROP INDEX IF EXISTS public.headlines_kaynak_tekil;
--
-- ============================================================================
-- Migration 027 sonu
-- ============================================================================
