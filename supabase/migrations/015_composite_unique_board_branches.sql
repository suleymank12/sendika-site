-- =============================================================================
-- 015_composite_unique_board_branches.sql
-- =============================================================================
-- board_members ve branches tablolarinin slug UNIQUE kisitlarini global'dan
-- tenant-scoped composite'e cevirir.
--
-- BAGLAM: Migration 009 §6 slug UNIQUE'leri composite'e cevirirken bu iki
-- tabloyu atladi (003'te ayri migration'da partial unique index olarak
-- eklenmislerdi, 009 sadece 001'deki tablo tanimlarindaki constraint'leri
-- ele aldi). Bu migration 009'un eksik kalan parcasini tamamlar.
--
-- DAVRANIS DEGISIKLIGI:
--   Once: Tum tenant'larda slug global benzersiz (Tenant A "ahmet-yilmaz"
--         eklerse Tenant B ekleyemez)
--   Sonra: Tenant icinde slug benzersiz (Tenant A ve Tenant B ayri ayri
--          "ahmet-yilmaz" ekleyebilir)
--
-- NOT: slug nullable oldugu icin partial UNIQUE INDEX kullanildi
-- (plain CONSTRAINT WHERE kosulu kabul etmez). 003'un partial desenini
-- (WHERE slug IS NOT NULL) korur — slug girilmemis kayitlara izin verir.
--
-- IDEMPOTENT: DROP IF EXISTS / IF NOT EXISTS ile tekrar calistirilabilir.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1) board_members: global slug unique → tenant-scoped
-- =============================================================================

DROP INDEX IF EXISTS board_members_slug_unique;

CREATE UNIQUE INDEX IF NOT EXISTS board_members_tenant_slug_unique
  ON board_members(tenant_id, slug)
  WHERE slug IS NOT NULL;

-- =============================================================================
-- 2) branches: global slug unique → tenant-scoped
-- =============================================================================

DROP INDEX IF EXISTS branches_slug_unique;

CREATE UNIQUE INDEX IF NOT EXISTS branches_tenant_slug_unique
  ON branches(tenant_id, slug)
  WHERE slug IS NOT NULL;

COMMIT;
