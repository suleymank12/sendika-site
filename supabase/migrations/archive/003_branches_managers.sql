-- ============================================================
-- 003_branches_managers.sql
-- Yönetim kurulu üyelerine ve şubelere detay sayfası alanları
-- ============================================================

-- ---------- board_members: detay sayfası için alanlar ----------
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE board_members ADD COLUMN IF NOT EXISTS email TEXT;

-- slug unique (ama null olabilir)
CREATE UNIQUE INDEX IF NOT EXISTS board_members_slug_unique
  ON board_members(slug) WHERE slug IS NOT NULL;

-- ---------- branches: detay sayfası + yönetici + harita ----------
ALTER TABLE branches ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_id UUID
  REFERENCES board_members(id) ON DELETE SET NULL;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_name TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_title TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_photo TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_bio TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_phone TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS manager_email TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS map_url TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS working_hours TEXT;
ALTER TABLE branches ADD COLUMN IF NOT EXISTS description TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS branches_slug_unique
  ON branches(slug) WHERE slug IS NOT NULL;
