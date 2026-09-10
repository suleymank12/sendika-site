-- ============================================================================
-- Migration 023: Public SELECT policy'leri yayin durumuna baglanir (Y1 / Parca A)
-- ============================================================================
--
-- BULGU (Guvenlik denetimi Tur 1, bulgu Y1):
--   gallery_images ve content_media'nin public SELECT policy'leri USING (true)
--   idi. Anon anahtar (JS bundle'inda, gizli degil) ile REST uzerinden
--   YAYINLANMAMIS icerigin medyasi cekilebiliyordu:
--
--     curl 'https://<proje>.supabase.co/rest/v1/content_media?select=url' \
--          -H "apikey: <anon key>"
--     -> Tum tenant'larin, HENUZ YAYINLANMAMIS haber/duyuru/sayfa
--        taslaklarina iliskin gorsel URL'leri. Storage bucket'i public-read
--        oldugu icin URL = erisim (basin oncesi duyuru, hazirlanan haber).
--
--   Ayni sekilde gallery_images USING (true) -> yayinlanmamis (is_published
--   = false) albumlerin fotograflari anon'a aciktı.
--
-- COZUM:
--   Iki tablonun da KENDI yayin kolonu YOK; yayin durumu parent kayitta.
--   Public policy'ler parent'in yayin durumuna baglanir.
--     - gallery_images  -> gallery_albums.is_published (gercek FK: album_id)
--     - content_media   -> polimorfik parent (content_type + content_id,
--                          FK YOK) -> 4 yonlu CASE
--
-- KOD DEGISIKLIGI GEREKMEZ: Public sayfalar zaten parent'i yayin filtresiyle
--   dogrulayip sonra medyayi cekiyor (galeri/[albumId], haberler/[slug],
--   duyurular/[slug], sayfa/[slug]). Yayinlanmis icerik AYNEN calismaya
--   devam eder; yalnizca taslaklar anon'dan gizlenir.
--
-- ETKI: Idempotent (DROP POLICY IF EXISTS + CREATE POLICY).
--   Tenant admin gorunurlugu DEGISMEZ (asagiya bkz. §3).
--
-- KAPSAM NOTU: Bu migration Y1'in yalnizca A PARCASI'dir. branches ve
--   board_members (kisisel e-posta/telefon toplu ifsasi) AYRI bir adimda,
--   server-side service-role'e tasinarak cozulecek — bu dosya onlara
--   DOKUNMAZ.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1) gallery_images — yalnizca YAYINLANMIS albumun fotograflari
-- ============================================================================
-- Eski tanim (001_initial_schema.sql:193-194):
--   CREATE POLICY "Public: gallery_images select" ON gallery_images
--     FOR SELECT USING (true);
--
-- gallery_images'in kendi is_published kolonu YOKTUR (001:110-117; sonraki
-- hicbir migration eklemedi). Yayin durumu parent albumdedir.

DROP POLICY IF EXISTS "Public: gallery_images select" ON public.gallery_images;

CREATE POLICY "Public: gallery_images select" ON public.gallery_images
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.gallery_albums a
      WHERE a.id = gallery_images.album_id
        AND a.is_published = true
    )
  );

-- NOT (kenar durum): album_id NULL olabilir (001:112'de NOT NULL yok).
-- NULL album_id -> EXISTS false -> anon goremez. Bu DOGRU davranistir:
-- albume bagli olmayan yetim bir foto zaten public galeride hic
-- gosterilmiyor (galeri/[albumId] sorgusu album_id ile filtreliyor).

-- ============================================================================
-- 2) content_media — yalnizca YAYINLANMIS parent'in medyasi
-- ============================================================================
-- Eski tanim (019_content_media.sql:94-96):
--   CREATE POLICY "content_media_public_read" ON public.content_media
--     FOR SELECT USING (true);
--
-- content_type degerleri 019:56'daki CHECK constraint ile sinirli:
--   ('news', 'announcement', 'page', 'headline')  [TEKIL isimler]
-- Parent tablo adlari COGUL: news, announcements, pages, headlines.
-- Yayin kolonlari: news/announcements/pages -> is_published,
--                  headlines               -> is_active  (002:15,34)

DROP POLICY IF EXISTS "content_media_public_read" ON public.content_media;

CREATE POLICY "content_media_public_read" ON public.content_media
  FOR SELECT
  USING (
    CASE content_media.content_type
      WHEN 'news' THEN EXISTS (
        SELECT 1 FROM public.news n
        WHERE n.id = content_media.content_id
          AND n.is_published = true
      )
      WHEN 'announcement' THEN EXISTS (
        SELECT 1 FROM public.announcements an
        WHERE an.id = content_media.content_id
          AND an.is_published = true
      )
      WHEN 'page' THEN EXISTS (
        SELECT 1 FROM public.pages p
        WHERE p.id = content_media.content_id
          AND p.is_published = true
      )
      WHEN 'headline' THEN EXISTS (
        SELECT 1 FROM public.headlines h
        WHERE h.id = content_media.content_id
          AND h.is_active = true
      )
      ELSE false          -- taninmayan content_type -> KAPALI (guvenli varsayilan)
    END
  );

-- NOT: 'headline' su an hicbir kod yolu tarafindan YAZILMIYOR (yalnizca
-- types/index.ts:153 union'i ve 019 CHECK constraint'i icinde tanimli).
-- Ileride kullanilirsa policy hazir olsun diye kapsandi.

-- ============================================================================
-- 3) KORUNANLAR — bu migration bunlara DOKUNMAZ
-- ============================================================================
-- Authenticated tenant policy'leri AYNEN yerinde kalir:
--   - tenant_gallery_images_all   (012:94-97)
--   - tenant_content_media_all    (019:99-103, 012:139-142)
-- Ikisi de: FOR ALL TO authenticated
--           USING/WITH CHECK (user_has_tenant_access(tenant_id))
--
-- Postgres'te ayni komut icin birden fazla PERMISSIVE policy OR'lanir.
-- Yani tenant admini kendi TASLAK icerigini gormeye DEVAM EDER: public
-- policy false donse bile tenant policy true doner. Admin panelde hicbir
-- davranis degismez.
--
-- RLS zaten aktif (001:164 gallery_images, 019:81 content_media) —
-- ENABLE ROW LEVEL SECURITY tekrarina gerek yok.

COMMIT;

-- ============================================================================
-- APPLY SONRASI DOGRULAMA — ayri ayri calistirin
-- ============================================================================
--
-- (a) Policy'ler yerinde mi? Her tabloda 2 satir beklenir:
--     public (SELECT) + tenant_*_all (ALL).
--
--     SELECT tablename, policyname, cmd, roles
--     FROM pg_policies
--     WHERE tablename IN ('gallery_images','content_media')
--     ORDER BY tablename, cmd;
--
-- (b) Yeni policy ifadesi dogru yazildi mi (gozle kontrol):
--
--     SELECT policyname, qual
--     FROM pg_policies
--     WHERE policyname IN ('Public: gallery_images select',
--                          'content_media_public_read');
--
-- (c) MANTIK TESTI — anon rolu gercekten ne goruyor?
--     set_config ile anon rolune gecip sayilari karsilastirin.
--     (Islem sonunda ROLLBACK — hicbir veri degismez.)
--
--     BEGIN;
--       -- Toplam satir (tablo sahibi gozuyle, RLS bypass):
--       SELECT count(*) AS toplam_foto FROM public.gallery_images;
--       SELECT count(*) AS toplam_medya FROM public.content_media;
--
--       -- Simdi anon gozuyle:
--       SET LOCAL ROLE anon;
--       SELECT count(*) AS anon_gordugu_foto  FROM public.gallery_images;
--       SELECT count(*) AS anon_gordugu_medya FROM public.content_media;
--     ROLLBACK;
--
--     BEKLENEN: anon sayilari <= toplam. Yayinlanmamis album/taslak varsa
--     kesinlikle KUCUK olmali. Esitse ya hic taslak yoktur (normal) ya da
--     policy uygulanmamistir -> (b) ile ifadeyi kontrol edin.
--
-- (d) HEDEFLI TEST (en kesin) — yayinlanmamis bir album ile:
--
--     -- 1. Yayinlanmamis album ve fotograflarini bul:
--     SELECT a.id AS album_id, a.title, a.is_published, count(i.id) AS foto
--     FROM public.gallery_albums a
--     LEFT JOIN public.gallery_images i ON i.album_id = a.id
--     WHERE a.is_published = false
--     GROUP BY a.id, a.title, a.is_published;
--
--     -- 2. Fotografi olan boyle bir album varsa, anon onu GOREMEMELI:
--     BEGIN;
--       SET LOCAL ROLE anon;
--       SELECT count(*) FROM public.gallery_images
--       WHERE album_id = '<yukaridaki album_id>';
--       -- BEKLENEN: 0
--     ROLLBACK;
--
--     -- Elde yayinlanmamis album yoksa: admin panelden bir album olusturup
--     -- "yayinda degil" birakin, icine 1 foto ekleyin, testi tekrarlayin.
--
-- (e) PUBLIC SITE REGRESYON TESTI (tarayici, incognito):
--     - /galeri            -> yayinlanmis albumler listeleniyor mu
--     - /galeri/<id>       -> yayinlanmis albumun fotograflari geliyor mu
--     - /haberler/<slug>   -> haber galerisi (content_media) geliyor mu
--     - /duyurular/<slug>  -> duyuru galerisi geliyor mu
--     - /sayfa/<slug>      -> sayfa galerisi geliyor mu
--     Admin panelde (giris yapmis): taslak haber/duyuru/sayfanin galerisi
--     ve yayinlanmamis albumun fotograflari HALA GORUNMELI.
--
-- ============================================================================
-- ROLLBACK (gerekirse — eski davranisa doner, sizinti tekrar acilir)
-- ============================================================================
--   DROP POLICY IF EXISTS "Public: gallery_images select" ON public.gallery_images;
--   CREATE POLICY "Public: gallery_images select" ON public.gallery_images
--     FOR SELECT USING (true);
--
--   DROP POLICY IF EXISTS "content_media_public_read" ON public.content_media;
--   CREATE POLICY "content_media_public_read" ON public.content_media
--     FOR SELECT USING (true);
-- ============================================================================
-- Migration 023 sonu
-- ============================================================================
