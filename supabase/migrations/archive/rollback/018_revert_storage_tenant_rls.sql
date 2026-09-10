-- =============================================================================
-- 018_revert_storage_tenant_rls.sql
-- =============================================================================
-- 017'nin geri alimi. 4 yeni tenant-aware policy'i drop edip eski 4 generic
-- policy'i restore eder.
--
-- KRITIK UYARI:
--   Rollback sonrasi cross-tenant write/update/delete tekrar mumkun olur.
--   Production'da bilinerek calistirilmali. Genelde gerek olmaz — sadece
--   017 hatali yazildi/uygulandi ise.
--
--   user_has_tenant_access fonksiyonu KASITLI olarak drop EDILMEZ:
--   012'den beri var ve diger tablolarin (news, announcements, ...) RLS
--   politikalari ona bagimli.
--
-- BU DOSYA OTOMATIK UYGULANMAZ — manuel kullanim icindir.
-- =============================================================================

BEGIN;

-- Yeni tenant-aware policy'leri drop
DROP POLICY IF EXISTS "images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "images_tenant_insert" ON storage.objects;
DROP POLICY IF EXISTS "images_tenant_update" ON storage.objects;
DROP POLICY IF EXISTS "images_tenant_delete" ON storage.objects;

-- Idempotentlik: revert daha once kismen calistiysa eski isimler de temizlenir
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- Eski generic policy'leri restore
CREATE POLICY "Public read access"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'images');

CREATE POLICY "Authenticated users can upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'images');

CREATE POLICY "Authenticated users can update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'images');

CREATE POLICY "Authenticated users can delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'images');

COMMIT;
