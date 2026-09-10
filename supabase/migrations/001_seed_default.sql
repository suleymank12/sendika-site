-- =============================================================================
-- 001_seed_default.sql — SIFIRDAN KURULUM TOHUMU (minimum)
-- =============================================================================
--
-- NE ZAMAN: yalnizca YENI bir Supabase projesinde, 000_baseline.sql'den
--   HEMEN SONRA. Baseline sema getirir (veri yok), bu dosya sitenin ilk
--   acilista patlamamasi icin gereken en kucuk veri kumesini yazar.
--
-- CANLI DB'YE CALISTIRILMAZ. Canlida bu satirlar zaten var; yine de
--   calistirilirsa idempotenttir (ON CONFLICT DO NOTHING / NOT EXISTS)
--   ve hicbir mevcut degeri EZMEZ.
--
-- ---------------------------------------------------------------------------
-- NE VAR, NEDEN
-- ---------------------------------------------------------------------------
-- 1) default tenant       ZORUNLU — kod sart kosuyor. lib/get-tenant.ts:18-24
--    bilinmeyen subdomain'de slug='default' tenant'ina duser; o satir yoksa
--    "Default tenant bulunamadi!" ile THROW eder ve site komple acilmaz.
--    Ayrica lib/constants.ts:RESERVED_TENANT_SLUGS ve 014'teki
--    prevent_default_tenant_deactivation trigger'i bu satiri varsayar.
--
-- 2) site_settings (10)   Anahtar kumesi, panelden kuruluş açan akisla
--    (api/super-admin/create-tenant/route.ts:131-142) BIREBIR AYNI tutuldu:
--    "elle kurulan default tenant" ile "panelden kurulan tenant" ayni yerden
--    baslasin. Degerler placeholder — Admin > Ayarlar'dan degistirilir.
--    Ayarlar sayfasi upsert kullaniyor (ayarlar/page.tsx:221-223), yani
--    buradaki eksik anahtarlar ilk kayitta kendiliginden olusur; bu 10 satir
--    yalnizca ILK RENDER'in bos/undefined gorunmemesi icin.
--
-- 3) menu_items (5)       Yine create-tenant/route.ts:164-170 ile ayni.
--    Menusuz bir site ilk acilista bos navbar gosterir; kurulum yapan kisi
--    "site bozuk mu" diye dusunmesin.
--
-- ---------------------------------------------------------------------------
-- NE YOK, NEDEN (bilincli kararlar)
-- ---------------------------------------------------------------------------
-- - DEMO HABER / DUYURU (eski 001_initial_schema.sql'de vardi): musterinin
--   canli sitesinde "Toplu Is Sozlesmesi Gorusmeleri Basladi" gibi uydurma
--   icerikler yayinda gorunuyordu. Yeni kurulumda ASLA olmamali.
--
-- - news_categories: panelden kurulan tenant'lar da kategorisiz basliyor
--   (create-tenant route kategori yazmiyor) ve uygulama bos listeye
--   dayanikli. Kategoriler kuruma ozel bir taksonomi — "Toplu Sozlesme",
--   "Basindan" her musteri icin anlamli degil. Admin > Kategoriler'den
--   eklenir (KURULUM.md Adim 9).
--
-- - homepage_sections / sliders / headlines: anasayfa tamamen veri gudumlu
--   ve hepsi `|| []` ile bos duruma dayanikli ((public)/page.tsx). Bolum
--   duzeni tasarim karari; tohum bunu musteri adina secmemeli.
--
-- - super_admins satiri: auth.users'ta HENUZ KULLANICI YOK, FK ihlal olur.
--   Once Auth'tan kullanici olusturulup sonra INSERT edilir — KURULUM.md
--   Adim 5 (e-posta hardcode etmeyen sorgu orada).
--
-- - storage bucket: SQL'in isi degil. KURULUM.md Adim 4.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) VARSAYILAN TENANT  (sabit UUID — 009'daki degerin AYNISI)
-- =============================================================================
-- UUID neden sabit: eski kurulumlarda tum icerik bu id'ye bagli ve
-- scripts/migrate-storage-prefix.mjs:63 ile storage klasor adlari da bu id'yi
-- kullaniyor. Degistirmeyin.
INSERT INTO public.tenants (id, name, slug, is_active)
VALUES ('00000000-0000-0000-0000-000000000001', 'Varsayılan Site', 'default', true)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 2) VARSAYILAN SITE AYARLARI
-- =============================================================================
-- Placeholder degerler lib/constants.ts:DEFAULT_META ile hizali
-- ("Sendika Adı" / "/placeholder-logo.png"). Bos birakilan iletisim alanlari
-- footer ve iletisim sayfasinda gosterilmez (Footer.tsx filtre mantigi).
INSERT INTO public.site_settings (tenant_id, key, value)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'site_title',            'Sendika Adı'),
  ('00000000-0000-0000-0000-000000000001', 'site_description',      'Sendika Adı Kurumsal Web Sitesi'),
  ('00000000-0000-0000-0000-000000000001', 'navbar_color',          '#1B3A5C'),
  ('00000000-0000-0000-0000-000000000001', 'layout_type',           'layout1'),
  ('00000000-0000-0000-0000-000000000001', 'logo_url',              '/placeholder-logo.png'),
  ('00000000-0000-0000-0000-000000000001', 'contact_phone',         ''),
  ('00000000-0000-0000-0000-000000000001', 'contact_email',         ''),
  ('00000000-0000-0000-0000-000000000001', 'contact_address',       ''),
  ('00000000-0000-0000-0000-000000000001', 'footer_credit_enabled', 'true'),
  ('00000000-0000-0000-0000-000000000001', 'footer_text',
     '© ' || EXTRACT(YEAR FROM now())::text || ' Sendika Adı. Tüm hakları saklıdır.')
ON CONFLICT (tenant_id, key) DO NOTHING;
-- ON CONFLICT hedefi 009'daki site_settings_tenant_key_key constraint'i.
-- DO NOTHING: tekrar calistirilirsa adminin degistirdigi degerleri EZMEZ.

-- =============================================================================
-- 3) VARSAYILAN MENU
-- =============================================================================
-- menu_items'ta unique constraint YOK -> ON CONFLICT kullanilamaz.
-- Guard tum kume uzerinde: default tenant'in HIC menu satiri yoksa yazilir.
-- Boylece tekrar kosumda, adminin sildigi bir menu ogesi geri GELMEZ.
INSERT INTO public.menu_items (tenant_id, title, url, "order", is_active)
SELECT '00000000-0000-0000-0000-000000000001', m.title, m.url, m.ord, true
FROM (VALUES
  ('Anasayfa',  '/',           1),
  ('Haberler',  '/haberler',   2),
  ('Duyurular', '/duyurular',  3),
  ('Galeri',    '/galeri',     4),
  ('İletişim',  '/iletisim',   5)
) AS m(title, url, ord)
WHERE NOT EXISTS (
  SELECT 1 FROM public.menu_items
  WHERE tenant_id = '00000000-0000-0000-0000-000000000001'
);

COMMIT;

-- =============================================================================
-- APPLY SONRASI DOGRULAMA — sirayla calistirin, beklenen degerler yaninda
-- =============================================================================
--
-- (a) default tenant tek satir, aktif  -> 1 satir, is_active = true
-- SELECT id, slug, name, is_active FROM public.tenants WHERE slug = 'default';
--
-- (b) ayarlar                          -> 10
-- SELECT count(*) FROM public.site_settings
-- WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
--
-- (c) menu                             -> 5
-- SELECT count(*) FROM public.menu_items
-- WHERE tenant_id = '00000000-0000-0000-0000-000000000001';
--
-- (d) DEMO ICERIK SIZMAMIS OLMALI      -> 0, 0
-- SELECT (SELECT count(*) FROM public.news) AS haber,
--        (SELECT count(*) FROM public.announcements) AS duyuru;
--
-- (e) idempotentlik testi: bu dosyayi IKINCI KEZ calistirin, sonra (b) ve (c)
--     tekrar 10 ve 5 donmeli (katlanmamali).
-- =============================================================================
