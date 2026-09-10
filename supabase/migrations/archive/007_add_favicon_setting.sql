-- ============================================================
-- 007_add_favicon_setting.sql
-- site_settings tablosuna favicon_url key'i ekler.
-- Tarayıcı sekmesinde görünen ikonun admin panelinden yönetilebilmesi için.
-- ============================================================

INSERT INTO site_settings (key, value)
VALUES ('favicon_url', '')
ON CONFLICT (key) DO NOTHING;
