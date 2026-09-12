-- ============================================================================
-- Migration 028: liste indeksleri — news / announcements / homepage_section_items
-- ============================================================================
--
-- SORUN (12 Eylul 2026, performans teshisi — NOTE.md "b4"):
--   Buyuyen tek iki tablo news ve announcements. Ikisinde de liste indeksinin
--   LIDER KOLONU YANLIS:
--
--     idx_news_published          (is_published, published_at DESC)
--     idx_announcements_published (is_published, published_at DESC)
--
--   tenant_id YOK. Uygulama HER sorguda tenant_id filtreliyor (tek istisna
--   yok — kod taramasiyla dogrulandi), dolayisiyla planner bu indeksi
--   TUM KURUMLARIN yayindaki icerigi uzerinde tariyor ve baskalarina ait
--   satirlari sonradan eliyor. Olculen israf (12 kurum, 24.000 satir):
--
--     LIMIT 12 icin  -> Rows Removed by Filter: 121  (12 satir icin 133 girdi)
--     10. sayfa icin -> Rows Removed by Filter: 1309
--
--   ASIL CARPAN SATIR SAYISI DEGIL, KURUM SAYISI. Bugun 2 kurum var, israf
--   ~2 kat; 40 kurumda ~%97 olur. Icerik girildikce degil, MUSTERI EKLENDIKCE
--   kotulesir.
--
--   Ikinci eksik: PANEL listeleri published_at ile DEGIL created_at ile
--   siraliyor (admin/haberler/page.tsx:43, admin/duyurular/page.tsx:42,
--   admin/page.tsx:141). Bunu karsilayan hicbir indeks yoktu; dashboard
--   LIMIT 5 icin bile tum satirlari okuyup top-N sort yapiyordu.
--
-- ============================================================================
-- OLCUM (yerel PG 18.3, repodaki 000_baseline + 027 yuklu, RLS acik,
--        12 kurum x 2.000 haber = 24.000 satir, anon/authenticated rolleri)
-- ============================================================================
--
--   sorgu                                ONCE                SONRA
--   -----------------------------------  ------------------  ----------------
--   panel dashboard  LIMIT 5             13.738 ms/4005 buf  0.785 ms/143 buf
--   public liste 10. sayfa               0.689 ms/183 buf    0.116 ms/123 buf
--   sitemap (LIMIT yok)                  5.554 ms/1627 buf   1.342 ms
--   public liste 1. sayfa                121 satir bosa      0 satir bosa
--
--   Indeks devreye girdikten sonra sure 100 satirdan 40.000'e kadar SABIT
--   (0.02-0.04 ms). Indeksin butun degeri bu: egri duzlesiyor.
--
-- ⚠ BUGUNKU HACIMDE OLCULEBILIR FAYDA YOK. 10 satirda planner indeksi
--   KULLANMIYOR, seq scan seciyor (dogru secim). Esik ~50 haber/kurum.
--   Yani apply sonrasi EXPLAIN hala "Seq Scan" gosterecek — HATA DEGIL.
--   Bu migration ILERIYE DONUK: sonradan eklemek de mumkun ama tablo
--   buyudukce apply suresi ve risk artar; simdi 2 ms.
--
-- ============================================================================
-- KARARLAR (hepsi olcumle alindi — NOTE.md "b4 TESHISI")
-- ============================================================================
--
--   PARTIAL INDEX (WHERE is_published) — HAYIR.
--     Tam bilesikle yan yana kuruldu, planner TAM bilesigi sectti. Ustelik
--     partial, panelin TASLAK filtresini (is_published = false) kapsamiyor;
--     o sorgu created_at indeksine dusup satir eliyor. 200 kB tasarruf icin
--     kapsama kaybi.
--
--   CONCURRENTLY — HAYIR.
--     CREATE INDEX ShareLock alir (olculdu): SELECT'i ENGELLEMEZ, yalniz
--     INSERT/UPDATE/DELETE bekler. Bugunku hacimde indeks basina 1.95 ms,
--     bes indeks ~10 ms. CONCURRENTLY ise transaction blogunda CALISMAZ
--     (bu dosyanin BEGIN/COMMIT desenini bozar) ve yarida kalirsa INVALID
--     indeks birakip elle temizlik gerektirir. 10 ms icin yanlis takas.
--
--   GEREKSIZ INDEKS TEMIZLIGI — BU DOSYADA YOK, bilerek.
--     idx_news_tenant / idx_announcements_tenant (unique kisitlarin oneki),
--     idx_news_published / idx_announcements_published (bu dosyadan sonra
--     islevsiz), idx_site_settings_tenant_key (unique kisitla BIREBIR ayni)
--     dusurulebilir gorunuyor. Ama indeks SILMEK ekleme kadar geri alinabilir
--     degil ve karar CANLIDAKI pg_stat_user_indexes.idx_scan sayaclarina
--     bakilmadan verilmemeli. Ayri tur: NOTE.md "BACKLOG — Gereksiz gorunen
--     indeksler".
--
-- ============================================================================
-- YAZMA MALIYETI: olculdu, satir basina ~+0,16 ms (2000 INSERT: ~1060 ms ->
--   ~1390 ms, gurultulu olcum). Bu bir CMS; toplu yukleme yok, insan dakikada
--   bir kayit yapiyor. Indeks boyutu 24.000 satirda ~976 kB/adet.
--
-- ELLE APPLY: Supabase SQL Editor (NOTE.md "elle apply" modeli).
--   Apply SONRASI: scripts/dump-baseline.sh ile 000_baseline.sql yeniden
--   uretilir (027'deki akisin aynisi). Baseline ELLE duzenlenmez.
--   Dogrulama sorgulari ve rollback dosya sonunda.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) news — public listeler
-- ----------------------------------------------------------------------------
-- Kapsadigi desenler: anasayfa haber bloku (LIMIT 6), /haberler sayfalamasi,
-- ilgili haberler (LIMIT 5), anasayfa bolum havuzlari, sitemap.
-- Kolon sirasi: once esitlik filtreleri (tenant_id, is_published), sonra
-- siralama kolonu (published_at DESC). Sondaki DESC sart degil ama sorgu
-- yonuyle birebir esleserek geriye tarama ihtiyacini kaldirir.
-- published_at NULL olabilir (taslakta ve "yayinda ama tarihsiz" satirda);
-- ORDER BY ... DESC varsayilani NULLS FIRST, indeks varsayilani da NULLS
-- FIRST -> esleme bozulmuyor.
CREATE INDEX IF NOT EXISTS idx_news_tenant_yayin
  ON public.news (tenant_id, is_published, published_at DESC);

COMMENT ON INDEX public.idx_news_tenant_yayin IS
  'Public haber listeleri: tenant_id + is_published -> published_at DESC (028). Mevcut idx_news_published lider kolonu is_published oldugu icin tum kurumlari tariyordu.';

-- ----------------------------------------------------------------------------
-- 2) news — panel listeleri
-- ----------------------------------------------------------------------------
-- Panel published_at DEGIL created_at ile siralar (taslaklarin da gorunmesi
-- gerekiyor; taslakta published_at NULL). is_published bilerek YOK: panel
-- filtresi ucu deger aliyor (hepsi / yayinda / taslak) ve "hepsi" en sik
-- kullanilan; kolonu araya koymak "hepsi" durumunu bozardi.
CREATE INDEX IF NOT EXISTS idx_news_tenant_created
  ON public.news (tenant_id, created_at DESC);

COMMENT ON INDEX public.idx_news_tenant_created IS
  'Panel haber listesi ve dashboard: tenant_id -> created_at DESC (028). Dashboard LIMIT 5 olcumu: 13.7 ms -> 0.8 ms.';

-- ----------------------------------------------------------------------------
-- 3) announcements — news ile ayni iki desen
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_announcements_tenant_yayin
  ON public.announcements (tenant_id, is_published, published_at DESC);

COMMENT ON INDEX public.idx_announcements_tenant_yayin IS
  'Public duyuru listeleri: tenant_id + is_published -> published_at DESC (028).';

CREATE INDEX IF NOT EXISTS idx_announcements_tenant_created
  ON public.announcements (tenant_id, created_at DESC);

COMMENT ON INDEX public.idx_announcements_tenant_created IS
  'Panel duyuru listesi: tenant_id -> created_at DESC (028).';

-- ----------------------------------------------------------------------------
-- 4) homepage_section_items — FK CASCADE, okuma degil
-- ----------------------------------------------------------------------------
-- 🔴 BU INDEKS SELECT ICIN DEGIL. idx_scan SAYACI 0 GORUNECEK — SILMEYIN.
--
-- Gerekce FK: homepage_section_items.section_id -> homepage_sections(id)
-- ON DELETE CASCADE ve bu FK'nin ALTINDA indeks yoktu. PostgreSQL bir
-- homepage_sections satiri silinince cocuk tabloyu kisit tetikleyicisinde
-- TARAMAK zorunda; indekssiz FK'de bu seq scan demektir. Olculdu (576 satir):
-- cascade tetikleyicisi 0.415 ms -> 0.319 ms. Etkilenen akislar: bolum silme
-- ve kurum silme (delete-tenant, tenants -> homepage_sections -> items).
--
-- SELECT tarafinda GEREKMEDIGI de olculdu: (section_id) ve
-- (tenant_id, section_id, "order") varyantlari kuruldu, planner IKISINI DE
-- HIC KULLANMADI (idx_scan = 0) — tenant filtresi zaten 48 satira indiriyor.
-- NOTE.md "b4" maddesi bu indeksi "listeler yavaslamasin" diye istiyordu;
-- olcum bunu DOGRULAMADI. Indeks yine de ekleniyor cunku 16 kB ve FK
-- hijyeni gercek.
CREATE INDEX IF NOT EXISTS idx_homepage_section_items_section
  ON public.homepage_section_items (section_id);

COMMENT ON INDEX public.idx_homepage_section_items_section IS
  'FK CASCADE icin — SELECT icin DEGIL (028). homepage_sections silinince cocuk tarama seq scan olmasin. idx_scan=0 gorunmesi NORMALDIR, silmeyin.';

COMMIT;

-- ============================================================================
-- APPLY ONCESI ENVANTER — apply'dan ONCE calistirin, ciktiyi NOTE.md'ye yazin
-- ============================================================================
--
-- (0a) Gercek hacim (indeksin ne zaman devreye girecegini bilmek icin)
--      SELECT t.slug,
--             (SELECT count(*) FROM public.news n WHERE n.tenant_id = t.id) AS haber,
--             (SELECT count(*) FROM public.announcements a WHERE a.tenant_id = t.id) AS duyuru
--      FROM public.tenants t ORDER BY t.slug;
--
-- (0b) Hangi indeksler GERCEKTEN kullaniliyor — temizlik turunun dayanagi
--      (bkz. NOTE.md "BACKLOG — Gereksiz gorunen indeksler")
--      SELECT relname, indexrelname, idx_scan,
--             pg_size_pretty(pg_relation_size(indexrelid)) AS boyut
--      FROM pg_stat_user_indexes
--      WHERE schemaname = 'public'
--      ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;
--
-- ============================================================================
-- APPLY SONRASI DOGRULAMA — bu sorgulari AYRI AYRI calistirin
-- ============================================================================
--
-- (a) Bes indeks de olustu mu?  -> 5 satir
--     SELECT indexname FROM pg_indexes
--     WHERE schemaname = 'public'
--       AND indexname IN ('idx_news_tenant_yayin', 'idx_news_tenant_created',
--                         'idx_announcements_tenant_yayin',
--                         'idx_announcements_tenant_created',
--                         'idx_homepage_section_items_section')
--     ORDER BY indexname;
--
-- (b) Plan REGRESYON yapmadi mi? (FAYDA BEKLEMEYIN — asagiyi okuyun)
--     EXPLAIN (ANALYZE, BUFFERS)
--     SELECT id, slug, title FROM public.news
--     WHERE tenant_id = '<kurum-id>' AND is_published = true
--     ORDER BY published_at DESC LIMIT 12;
--
--     ⚠ BUGUN BEKLENEN CIKTI: "Seq Scan" ve ~0.03 ms. Bu HATA DEGIL —
--       10 satirda planner indeksi kullanmaz. Indeks ~50 haber/kurumdan
--       sonra devreye girer ve o noktadan sonra sure SABIT kalir.
--       Bugun kanitlanmasi gereken tek sey: sorgu HALA calisiyor ve
--       eskisinden yavas degil.
--
-- (c) Indeks boyutlari (Free planda 500 MB sinir var)
--     SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS boyut
--     FROM pg_stat_user_indexes
--     WHERE indexrelname LIKE 'idx_news_tenant_%'
--        OR indexrelname LIKE 'idx_announcements_tenant_%'
--        OR indexrelname = 'idx_homepage_section_items_section'
--     ORDER BY indexrelname;
--
-- (d) Panel hala yaziyor mu? (ShareLock birakildi mi — apply bitince serbest)
--     Panelden bir haber kaydedin. Beklenen: normal, gecikme yok.
--
-- (e) NE ZAMAN TEKRAR BAKILACAK
--     (0a) sorgusunda bir kurumun haber sayisi 200'u gectiginde (b) sorgusu
--     tekrar calistirilir; o noktada plan "Index Scan using
--     idx_news_tenant_yayin" olmalidir. Olmuyorsa ANALYZE public.news;
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--     DROP INDEX IF EXISTS public.idx_news_tenant_yayin;
--     DROP INDEX IF EXISTS public.idx_news_tenant_created;
--     DROP INDEX IF EXISTS public.idx_announcements_tenant_yayin;
--     DROP INDEX IF EXISTS public.idx_announcements_tenant_created;
--     DROP INDEX IF EXISTS public.idx_homepage_section_items_section;
--
--     (Indeks dusurmek veriyi etkilemez; DROP INDEX kisa sureli
--      AccessExclusiveLock alir — okuma da dahil her seyi bekletir, ama
--      milisaniyeler surer.)
--
-- ============================================================================
-- Migration 028 sonu
-- ============================================================================
