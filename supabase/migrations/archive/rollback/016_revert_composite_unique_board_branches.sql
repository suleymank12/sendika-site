-- =============================================================================
-- 016_revert_composite_unique_board_branches.sql
-- =============================================================================
-- 015'in geri alimi: board_members ve branches slug UNIQUE'lerini
-- tenant-scoped'tan global'a geri cevirir.
--
-- ⚠️  KRITIK UYARI:
-- 015 uygulandiktan sonra cross-tenant ayni slug'li kayit eklendiyse
-- bu rollback BASARISIZ olur (eski global index olusturulamaz, cakisma).
-- Geri alma oncesi duplicate kontrolu ZORUNLU:
--
--   SELECT slug, COUNT(*) FROM board_members
--   WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1;
--
--   SELECT slug, COUNT(*) FROM branches
--   WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1;
--
-- Sonuc bos olmali. Aksi takdirde duplicate'leri elle cozdukten sonra
-- rollback'i calistir.
--
-- BU DOSYA OTOMATIK UYGULANMAZ — manuel kullanim icindir.
-- =============================================================================

BEGIN;

-- board_members: tenant-scoped → global
DROP INDEX IF EXISTS board_members_tenant_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS board_members_slug_unique
  ON board_members(slug)
  WHERE slug IS NOT NULL;

-- branches: tenant-scoped → global
DROP INDEX IF EXISTS branches_tenant_slug_unique;
CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_unique
  ON branches(slug)
  WHERE slug IS NOT NULL;

COMMIT;
