-- ============================================================
-- Migration 002: Layout Update — Manşet sistemi ve tema ayarları
-- ============================================================

-- A) headlines tablosu (manşet sistemi)
CREATE TABLE IF NOT EXISTS headlines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  subtitle TEXT,
  image_url TEXT,
  link_url TEXT,
  source_type TEXT,        -- 'custom', 'news', 'announcement'
  source_id UUID,          -- news veya announcement id'si (opsiyonel)
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- B) site_settings tablosuna yeni varsayılan kayıtlar
INSERT INTO site_settings (id, key, value)
VALUES
  (uuid_generate_v4(), 'navbar_color', '#1B3A5C'),
  (uuid_generate_v4(), 'layout_type', 'layout1'),
  (uuid_generate_v4(), 'site_logo_url', '/placeholder-logo.png')
ON CONFLICT (key) DO NOTHING;

-- C) headlines tablosu için RLS politikaları
ALTER TABLE headlines ENABLE ROW LEVEL SECURITY;

-- Public: sadece aktif manşetleri okuyabilir
CREATE POLICY "headlines_public_select"
  ON headlines
  FOR SELECT
  USING (is_active = true);

-- Authenticated: tam CRUD
CREATE POLICY "headlines_auth_select"
  ON headlines
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "headlines_auth_insert"
  ON headlines
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "headlines_auth_update"
  ON headlines
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "headlines_auth_delete"
  ON headlines
  FOR DELETE
  TO authenticated
  USING (true);

-- D) news ve announcements tablolarına is_headline kolonu
ALTER TABLE news ADD COLUMN IF NOT EXISTS is_headline BOOLEAN DEFAULT false;
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS is_headline BOOLEAN DEFAULT false;

-- E) Storage bucket boyut limiti güncelleme
-- NOT: Supabase Storage bucket boyut limitleri SQL ile değiştirilemez.
-- Supabase Dashboard > Storage > Buckets bölümünden ilgili bucket'ın
-- boyut limitini manuel olarak güncelleyin (video desteği için 400MB önerilir).
