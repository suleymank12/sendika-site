-- ============================================================================
-- Migration 029: super admin'in KURUM VERISINE otomatik erisimi kaldirilir
-- ============================================================================
--
-- SORUN (19 Eylul 2026, canli olcum):
--   Super admin hesabi HICBIR kurumun uyesi olmadigi halde
--   kurmayteknoloji.com/admin adresinden Kurmay'in panelinde ACILDI ve
--   kurumun gercek verisini gordu.
--
--   Kok neden IKI KATMANLIYDI:
--     (1) app/admin/(authenticated)/layout.tsx — uyelik kontrolunu atlayan
--         "super admin bypass" (ayni turda kaldirildi)
--     (2) BU FONKSIYON — asil yetki burada
--
--   🔴 (1) tek basina duzeltilse YETMEZDI: tarayici Supabase PostgREST'e
--   DOGRUDAN konusuyor (createBrowserClient + anon key + oturum JWT'si).
--   Layout yalnizca sunucuda cizilen bir ekran; onu kapatmak veriyi
--   kapatmaz. Gercek sinir RLS'tir.
--
-- ETKI ALANI (fonksiyon 16 icerik tablosunun ve 3 storage politikasinin
--   tek kapisi): news, announcements, pages, news_categories, menu_items,
--   headlines, sliders, homepage_sections, homepage_section_items,
--   gallery_albums, gallery_images, board_members, branches, site_settings,
--   content_media, contact_messages + storage.objects images_tenant_{insert,
--   update,delete}.
--
--   Politikalar "FOR ALL" ve USING ile WITH CHECK AYNI fonksiyonu cagiriyor;
--   yani okuma ile yazma arasinda hicbir ayrim yoktu. Super admin her
--   kurumun haberini silebiliyor, ayarlarini degistirebiliyor, gelen
--   mesajlarini (ad/e-posta/telefon/mesaj) okuyup silebiliyordu — HICBIR IZ
--   BIRAKMADAN (projede denetim/log tablosu yok).
--
-- KVKK: contact_messages gercek kisisel veri tutuyor ve bunlar SENDIKA
--   siteleri. KVKK md. 6 "sendika uyeligi"ni OZEL NITELIKLI kisisel veri
--   sayiyor; bir sendikanin iletisim formuna yazan kisinin mesaji bu
--   iliskiyi ele verebilir. Musteri = veri sorumlusu, platform = veri
--   isleyen. Sinirsiz + kayitsiz + musterinin haberi olmayan erisim
--   savunulabilir degil.
--
-- KARAR (19 Eylul 2026): super admin kurum paneline HIC GIREMEZ.
--   Girmesi gerekirse ONCE kendini o kurumun tenant_users listesine ekler
--   (super admin paneli > kurum detay > "Tenant Admin Kullanicilari"), isi
--   biter bitmez CIKARIR. Boylece erisim bir DB satirina baglanir:
--   created_at damgasi duser, listede gorunur — IZ BIRAKIR.
--
--   "Salt okunur" secenegi degerlendirildi ve ELENDI: asil dert yazma degil
--   IZ; salt okunur erisim de gelen mesajlari kayitsiz okumaya devam
--   ederdi. Ayrica 16 tablonun FOR ALL politikasini ikiye bolmek (~32
--   politika + 3 storage) ve 19 admin sayfasinda dugme devre disi birakmak
--   gerekirdi. Gerekce: NOTE.md "SUPER ADMIN KURUM ERISIMI".
--
-- NE KIRILMAZ (tek tek dogrulandi):
--   - Super admin panelinin TAMAMI: kurum listesi/detayi `tenants`
--     tablosunu okuyor, onun politikalari DOGRUDAN is_super_admin'e
--     dayaniyor (tenants_public_select / tenants_super_admin_*).
--   - Kurum olustur/sil/ac-kapa/duzenle, Kurulum Durumu, tenant-users,
--     yetim hesaplar: hepsi SERVICE ROLE ile calisiyor (createAdminClient),
--     RLS'e hic takilmaz.
--   - tenant_users yonetimi: tenant_users_super_admin_{insert,update,delete}
--     politikalari DOGRUDAN is_super_admin kullaniyor — yani super admin
--     kendini bir kuruma ekleyip cikarmaya DEVAM EDEBILIR (geri donme yolu).
--   - Yedekleme / storage supurme cron'lari: service role.
--
-- 🔴 KABUL EDILEN SONUC: super admin hesabi artik HICBIR kurum paneline
--   giremez — `default` kurum (buyukdirilis.org.tr) DAHIL. Bu bilincli:
--   "super admin kurum paneline girmez" kurali istisnasiz olsun diye
--   (kullanici karari, 19 Eylul). Default kurumun kendi admini zaten var.
--
-- ELLE APPLY: Supabase SQL Editor ya da psql (NOTE.md "elle apply" modeli).
--   ⚠️ APPLY ONCESI DRIFT KONTROLU SART — dosya sonundaki (0) sorgusu.
--   Apply sonrasi dogrulama ve rollback da dosya sonunda.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- user_has_tenant_access — YALNIZ uyelige bakar
-- ----------------------------------------------------------------------------
-- IMZA-UYUMLU `CREATE OR REPLACE`. Degistirilmemesi gerekenler (degisirse
-- apply patlar ya da guvenlik geriler):
--   - parametre adi `tenant_id_param`  → degisirse
--     "cannot change name of input parameter" hatasi
--   - `SECURITY DEFINER`               → fonksiyon tenant_users'i okuyabilmeli
--   - `SET search_path = public`       → SECURITY DEFINER'da sart
--   - `LANGUAGE sql` / `STABLE`        → planlayici davranisi ayni kalsin
--
-- TEK DEGISIKLIK: `OR public.is_super_admin(auth.uid())` satiri KALDIRILDI.
-- Politikalara DOKUNULMUYOR — 16 tablo + 3 storage politikasi bu fonksiyonu
-- cagirmaya devam ediyor, yalnizca cevabi degisti.
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(tenant_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_users
    WHERE user_id = auth.uid() AND tenant_id = tenant_id_param
  );
$$;

COMMENT ON FUNCTION public.user_has_tenant_access(uuid) IS
  'Kullanici bu kurumun UYESI mi? YALNIZ tenant_users. Super admin kisayolu '
  '029 ile KALDIRILDI (19 Eylul 2026): super admin kurum panelinde is '
  'yapacaksa once kendini tenant_users''a ekler, isi bitince cikarir — '
  'erisim boylece iz birakir. Gerekce: NOTE.md "SUPER ADMIN KURUM ERISIMI".';

-- GRANT'i yeniden yazmaya gerek yok: CREATE OR REPLACE mevcut ACL'i korur.
-- (Yine de emniyet icin, 012/017 ile ayni satir — idempotent.)
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(uuid) TO authenticated;

COMMIT;

-- ============================================================================
-- (0) 🔴 APPLY ONCESI — DRIFT KONTROLU (ONCE BUNU CALISTIRIN)
-- ============================================================================
-- Canlidaki fonksiyonun GERCEK tanimini okuyun. Repo ile canli ayrismis
-- olabilir; emsali NOTE.md'de var (Sprint 4 Madde 5 — 020 maddesinde
-- "drift var mi" diye tam bu sorgu calistirilmisti).
--
--     SELECT pg_get_functiondef('public.user_has_tenant_access(uuid)'::regprocedure);
--
-- BEKLENEN (apply ONCESI): ciktida `is_super_admin` GECIYOR olmali.
--   - Geciyorsa  → bu migration'in yapacagi is var, devam edin.
--   - GECMIYORSA → DURUN. Canlida zaten super admin kisayolu yok demektir;
--     o zaman kurmayteknoloji.com/admin'de panelin ACILMASININ sebebi
--     baska (ornegin super admin hesabi gercekten tenant_users'ta). Once
--     asagidaki (0b) ile uyelikleri okuyun.
--
-- (0b) Uyelik dokumu — super admin hesabi gercekten uye mi?
--     SELECT tu.tenant_id, t.slug, u.email, tu.role, tu.created_at
--     FROM public.tenant_users tu
--     JOIN public.tenants t ON t.id = tu.tenant_id
--     JOIN auth.users u ON u.id = tu.user_id
--     ORDER BY t.slug, u.email;
--
-- (0c) Super admin listesi — kim etkilenecek?
--     SELECT sa.user_id, u.email
--     FROM public.super_admins sa
--     JOIN auth.users u ON u.id = sa.user_id;
--
-- ============================================================================
-- (1) APPLY SONRASI DOGRULAMA
-- ============================================================================
-- (a) Fonksiyon tanimi — `is_super_admin` ARTIK GECMEMELI
--     SELECT pg_get_functiondef('public.user_has_tenant_access(uuid)'::regprocedure);
--
-- (b) Nitelikler korundu mu? Beklenen: prosecdef=t (SECURITY DEFINER),
--     provolatile='s' (STABLE), proconfig={search_path=public}
--     SELECT proname, prosecdef, provolatile, proconfig,
--            pg_get_function_arguments(oid) AS args
--     FROM pg_proc
--     WHERE oid = 'public.user_has_tenant_access(uuid)'::regprocedure;
--
-- (c) EXECUTE yetkisi duruyor mu? (authenticated gormeli)
--     SELECT grantee, privilege_type
--     FROM information_schema.routine_privileges
--     WHERE routine_name = 'user_has_tenant_access';
--
-- (d) Politikalar DEGISMEDI mi? Beklenen: 16 satir, hepsi
--     user_has_tenant_access cagiriyor (bu migration onlara dokunmadi)
--     SELECT tablename, policyname
--     FROM pg_policies
--     WHERE schemaname = 'public' AND qual LIKE '%user_has_tenant_access%'
--     ORDER BY tablename;
--
-- (e) Storage politikalari (3 satir beklenir)
--     SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname = 'storage' AND policyname LIKE 'images_tenant_%';
--
-- (f) 🔴 PANEL TESTI — asil kanit, tarayicida:
--     - Super admin hesabiyla kurmayteknoloji.com/admin  -> "Yetkisiz" (giremez)
--     - Super admin hesabiyla buyukdirilis.org.tr/admin   -> "Yetkisiz" (giremez;
--       BILINCLI, yukaridaki "KABUL EDILEN SONUC")
--     - Kurum admini kendi paneline                       -> NORMAL calisir
--     - Super admin paneli (superadminpanel.*)            -> NORMAL calisir
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Tek satir geri gelir; politikalara dokunulmadigi icin baska is yok.
--
--     CREATE OR REPLACE FUNCTION public.user_has_tenant_access(tenant_id_param uuid)
--     RETURNS boolean
--     LANGUAGE sql
--     STABLE
--     SECURITY DEFINER
--     SET search_path = public
--     AS $$
--       SELECT
--         EXISTS (
--           SELECT 1 FROM public.tenant_users
--           WHERE user_id = auth.uid() AND tenant_id = tenant_id_param
--         )
--         OR public.is_super_admin(auth.uid());
--     $$;
--
-- ⚠️ Rollback KOD tarafini geri getirmez: layout.tsx'teki bypass da
--    kaldirildi. Yalnizca SQL'i geri almak, super admine RLS yetkisini
--    verir ama panel yine "Yetkisiz" der (PostgREST'e dogrudan erisim
--    acilir). Tam geri donus icin kod da geri alinmali.
--
-- ============================================================================
-- Migration 029 sonu
-- ============================================================================
