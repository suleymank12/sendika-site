-- ============================================================
-- 008_add_social_media_keys.sql
-- site_settings tablosuna ek sosyal medya anahtarları ekler.
-- Boş bırakılan alanlar footer'da gösterilmez (Footer.tsx filter mantığı).
-- ============================================================

INSERT INTO site_settings (key, value)
VALUES
  ('linkedin_url', ''),
  ('whatsapp_url', ''),
  ('telegram_url', ''),
  ('tiktok_url', ''),
  ('threads_url', ''),
  ('bluesky_url', ''),
  ('spotify_url', '')
ON CONFLICT (key) DO NOTHING;
