-- ============================================================
-- 004_news_categories.sql
-- Haber kategorileri için ayrı yönetim tablosu
-- ============================================================

CREATE TABLE IF NOT EXISTS news_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE news_categories ENABLE ROW LEVEL SECURITY;

-- Public okuma (aktif olanları)
CREATE POLICY "Public read active categories" ON news_categories
  FOR SELECT USING (is_active = true);

-- Authenticated tam erişim
CREATE POLICY "Auth full access categories" ON news_categories
  FOR ALL USING (auth.role() = 'authenticated');

-- Mevcut 4 kategori
INSERT INTO news_categories (name, slug, "order", is_active) VALUES
  ('Genel',           'genel',          0, true),
  ('Toplu Sözleşme',  'toplu-sozlesme', 1, true),
  ('Eğitim',          'egitim',         2, true),
  ('Basından',        'basindan',       3, true)
ON CONFLICT (slug) DO NOTHING;
