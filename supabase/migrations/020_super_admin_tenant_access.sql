-- ============================================================================
-- Migration 020: user_has_tenant_access super admin shortcut (varlik garantisi)
-- ============================================================================
--
-- BAGLAM: user_has_tenant_access 012'de kuruldu, 017'de varlik garantisi
-- icin tekrarlandi. Super admin metadata-only pattern kullaniyor
-- (tenant_users tablosuna kayitli DEGIL). Super admin'in TUM tenant'lara
-- erisimi bu fonksiyonun is_super_admin sartina bagli.
--
-- ETKI (super admin kapsanmazsa): Sprint 3.6 (orphan storage) ve Sprint 4
-- M4 (replace orphan) cleanup'lari super admin icin SESSIZCE basarisiz olur
-- (Supabase RLS DELETE reddinde 200 doner ama dosya silinmez).
--
-- COZUM / NIYET: Fonksiyonun super admin shortcut'i ICERDIGINI garanti et.
-- is_super_admin(auth.uid()) TRUE ise her tenant'a erisim TRUE doner;
-- aksi halde tenant_users uyeligine bakilir (eski davranis korunur).
--
-- ============================================================================
-- ONEMLI NOT (repo ile tutarlilik):
--   012 (satir 22-28) ve 017 (satir 42-48) tanimlari ZATEN
--   "... OR public.is_super_admin(auth.uid())" iceriyor. Yani repo'daki
--   fonksiyon mantiken super admin'i KAPSIYOR. Bu migration:
--     1) Lokal/prod DB'deki fonksiyonun repo ile DRIFT etmis (eski, super
--        admin'siz) bir surumu kalmis olma ihtimaline karsi onu repo
--        mantigina hizalar (drift duzeltme),
--     2) Super admin kontrolunu ONE alarak niyeti explicit yapar.
--   Eger DB'deki fonksiyon zaten 012 surumuyse bu migration DAVRANISI
--   DEGISTIRMEZ (idempotent varlik garantisi). O durumda cleanup hala
--   basarisizsa kok neden BASKA yerdedir (bkz. dosya sonu teshis notu).
-- ============================================================================
--
-- IMZA KORUNDU (kritik): Parametre adi tenant_id_param, LANGUAGE sql,
-- STABLE, SECURITY DEFINER ve SET search_path = public — 012/017 ile
-- BIREBIR ayni. CREATE OR REPLACE parametre adini degistiremez; ayrica
-- SECURITY DEFINER fonksiyonda search_path sabitlemesi guvenlik icin sart.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(tenant_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1) Super admin tum tenant'lara erisebilir (kisa devre — once kontrol)
  -- 2) Normal kullanici: tenant_users uyeligine gore (geriye uyumlu)
  SELECT
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE user_id = auth.uid()
        AND tenant_id = tenant_id_param
    );
$$;

-- 012/017'deki GRANT korunur (CREATE OR REPLACE grant'i dusurmez ama
-- varlik garantisi icin tekrar verilir — idempotent).
GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(UUID) TO authenticated;

-- ============================================================================
-- Migration 020 sonu
-- ============================================================================
--
-- TESHIS NOTU (Suleyman icin — apply sonrasi cleanup HALA basarisizsa):
--   Asagidakiler kontrol edilmeli, cunku fonksiyon zaten super admin'i
--   iceriyordu (yukariya bkz.):
--
--   a) 017_storage_tenant_rls.sql APPLY EDILDI MI?
--      NOTE.md: "017 OLUSTURULDU ama Supabase'e UYGULANMADI". 017 storage
--      DELETE policy'sini (images_tenant_delete) kurar. Apply edilmediyse
--      storage.objects'te ESKI generic policy gecerlidir. Eski policy
--      davranisi: super admin DELETE yapabilir mi? generic policy
--      "auth.uid() IS NOT NULL" ise yapabilmeli; degilse kirik.
--
--   b) DB'deki user_has_tenant_access GERCEKTEN repo surumunde mi?
--      SELECT pg_get_functiondef('public.user_has_tenant_access(uuid)'::regprocedure);
--      -> "is_super_admin" gecip gecmedigini gor. Gecmiyorsa drift vardi,
--         bu migration onu duzeltir (asil cozum buydu).
--
--   c) is_super_admin(010) yalnizca raw_user_meta_data (user_metadata)
--      bakar. Super admin app_metadata'da isaretlenmisse fonksiyon FALSE
--      doner. SELECT raw_user_meta_data->>'is_super_admin' FROM auth.users
--      WHERE email = '...'; ile 'true' (string) oldugu dogrulanmali.
-- ============================================================================
