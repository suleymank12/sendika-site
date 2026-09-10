-- =============================================================================
-- 017_storage_tenant_rls.sql
-- =============================================================================
-- Storage objects tablosunda generic policy'leri tenant-aware'a cevirir.
--
-- ONCE: 4 generic policy (her authenticated kullanici tum dosyalara erisir)
-- SONRA: 4 tenant-scoped policy (sadece kendi {tenant_id}/... prefix'ine
--        yazar/siler/gunceller, herkes okur)
--
-- SUPER ADMIN: user_has_tenant_access fonksiyonu super admin'i otomatik
--   icerir (010_super_admin.sql + 012_tenant_aware_rls.sql), ayri bypass
--   politikasi gerekmez.
--
-- GUVENLIK: name ~ '^<uuid>/' guard'i ::uuid cast'i guvene alir (eski
--   prefix'siz dosya kalsa bile cast hatasi firlatmaz). Asama 2'de tum
--   dosyalar prefix'lendi; bu defansif onlem.
--
-- KRITIK: Bu migration UYGULANMADAN ONCE Asama 2 (migrate-storage-prefix.mjs)
--   TAMAMLANMIS olmali. Aksi takdirde eski prefix'siz dosyalara erisim
--   (write/update/delete) kirilir.
--
-- NOT: user_has_tenant_access tanimi 012_tenant_aware_rls.sql'deki SQL
--   tanimiyla BIREBIR ayni (LANGUAGE sql, SECURITY DEFINER, search_path
--   sabitli). Burada CREATE OR REPLACE sadece idempotentlik/varlik
--   garantisi icin tekrarlanir — mevcut tanimi degistirmez/zayiflatmaz.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) Bagimlilik garantisi: user_has_tenant_access fonksiyonu
-- =============================================================================
-- 012'deki tanimin aynisi (regresyon yapmamak icin birebir kopya).

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(tenant_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE user_id = auth.uid() AND tenant_id = tenant_id_param
    )
    OR public.is_super_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(UUID) TO authenticated;

-- =============================================================================
-- 2) Eski generic policy'leri DROP
-- =============================================================================
-- Supabase Dashboard'da olusturulmus policy'lerin tam isimleri:

DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;
DROP POLICY IF EXISTS "Public read access" ON storage.objects;

-- Idempotentlik: 017 daha once kismen calistiysa yeni policy'ler de kalkar
DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "images_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "images_tenant_delete" ON storage.objects;

-- =============================================================================
-- 3) Yeni tenant-aware policy'ler
-- =============================================================================

-- SELECT: anon dahil herkes okur (site gorselleri icin zorunlu)
CREATE POLICY "images_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'images');

-- INSERT: sadece kendi tenant prefix'ine
CREATE POLICY "images_tenant_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'images'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND public.user_has_tenant_access(
      ((storage.foldername(name))[1])::uuid
    )
  );

-- UPDATE: sadece kendi tenant prefix'i
CREATE POLICY "images_tenant_update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND public.user_has_tenant_access(
      ((storage.foldername(name))[1])::uuid
    )
  )
  WITH CHECK (
    bucket_id = 'images'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND public.user_has_tenant_access(
      ((storage.foldername(name))[1])::uuid
    )
  );

-- DELETE: sadece kendi tenant prefix'i
CREATE POLICY "images_tenant_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'images'
    AND name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    AND public.user_has_tenant_access(
      ((storage.foldername(name))[1])::uuid
    )
  );

COMMIT;
