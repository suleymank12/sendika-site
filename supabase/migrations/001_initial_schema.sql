-- =============================================
-- Sendika Kurumsal Web Sitesi - Veritabani Semasi
-- =============================================

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLOLAR
-- =============================================

-- Menu Items (self-referencing)
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  url TEXT,
  parent_id UUID REFERENCES menu_items(id) ON DELETE SET NULL,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- News (Haberler)
CREATE TABLE news (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT,
  content TEXT,
  cover_image TEXT,
  category TEXT,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Announcements (Duyurular)
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  summary TEXT,
  content TEXT,
  cover_image TEXT,
  is_published BOOLEAN DEFAULT false,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Sliders
CREATE TABLE sliders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT,
  subtitle TEXT,
  image_url TEXT NOT NULL,
  link_url TEXT,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pages (Dinamik Sayfalar)
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Board Members (Yonetim Kurulu)
CREATE TABLE board_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  title TEXT,
  photo TEXT,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Branches (Subeler)
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  city TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN DEFAULT true,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gallery Albums
CREATE TABLE gallery_albums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  cover_image TEXT,
  "order" INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gallery Images
CREATE TABLE gallery_images (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID REFERENCES gallery_albums(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT,
  "order" INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Site Settings
CREATE TABLE site_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Quick Access (Hizli Erisim Butonlari)
CREATE TABLE quick_access (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  icon TEXT,
  url TEXT NOT NULL,
  "order" INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================
-- INDEXLER
-- =============================================

CREATE INDEX idx_menu_items_parent ON menu_items(parent_id);
CREATE INDEX idx_menu_items_order ON menu_items("order");
CREATE INDEX idx_news_slug ON news(slug);
CREATE INDEX idx_news_published ON news(is_published, published_at DESC);
CREATE INDEX idx_announcements_slug ON announcements(slug);
CREATE INDEX idx_announcements_published ON announcements(is_published, published_at DESC);
CREATE INDEX idx_pages_slug ON pages(slug);
CREATE INDEX idx_gallery_images_album ON gallery_images(album_id);
CREATE INDEX idx_site_settings_key ON site_settings(key);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sliders ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_access ENABLE ROW LEVEL SECURITY;

-- Public SELECT policies (sadece aktif/yayinlanmis icerikleri oku)
CREATE POLICY "Public: menu_items select" ON menu_items
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public: news select" ON news
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public: announcements select" ON announcements
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public: sliders select" ON sliders
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public: pages select" ON pages
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public: board_members select" ON board_members
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public: branches select" ON branches
  FOR SELECT USING (is_active = true);

CREATE POLICY "Public: gallery_albums select" ON gallery_albums
  FOR SELECT USING (is_published = true);

CREATE POLICY "Public: gallery_images select" ON gallery_images
  FOR SELECT USING (true);

CREATE POLICY "Public: site_settings select" ON site_settings
  FOR SELECT USING (true);

CREATE POLICY "Public: quick_access select" ON quick_access
  FOR SELECT USING (is_active = true);

-- Admin full CRUD policies (authenticated users)
CREATE POLICY "Admin: menu_items all" ON menu_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: news all" ON news
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: announcements all" ON announcements
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: sliders all" ON sliders
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: pages all" ON pages
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: board_members all" ON board_members
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: branches all" ON branches
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: gallery_albums all" ON gallery_albums
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: gallery_images all" ON gallery_images
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: site_settings all" ON site_settings
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin: quick_access all" ON quick_access
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- =============================================
-- SEED DATA
-- =============================================

-- Site Settings
INSERT INTO site_settings (key, value) VALUES
  ('logo_url', '/placeholder-logo.png'),
  ('site_title', 'Sendika Adı'),
  ('site_description', 'Sendika Adı Kurumsal Web Sitesi'),
  ('footer_text', '© 2026 Sendika Adı. Tüm hakları saklıdır.'),
  ('contact_phone', '+90 (312) 000 00 00'),
  ('contact_email', 'info@sendika.org.tr'),
  ('contact_address', 'Örnek Mahallesi, Örnek Caddesi No:1, 06000 Ankara'),
  ('facebook_url', 'https://facebook.com/sendika'),
  ('twitter_url', 'https://twitter.com/sendika'),
  ('instagram_url', 'https://instagram.com/sendika');

-- Menu Items
INSERT INTO menu_items (id, title, url, parent_id, "order", is_active) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'Anasayfa', '/', NULL, 1, true),
  ('a0000000-0000-0000-0000-000000000002', 'Kurumsal', NULL, NULL, 2, true),
  ('a0000000-0000-0000-0000-000000000003', 'Hakkımızda', '/kurumsal/hakkimizda', 'a0000000-0000-0000-0000-000000000002', 1, true),
  ('a0000000-0000-0000-0000-000000000004', 'Tüzük', '/kurumsal/tuzuk', 'a0000000-0000-0000-0000-000000000002', 2, true),
  ('a0000000-0000-0000-0000-000000000005', 'Yönetim Kurulu', '/kurumsal/yonetim-kurulu', 'a0000000-0000-0000-0000-000000000002', 3, true),
  ('a0000000-0000-0000-0000-000000000006', 'Haberler', '/haberler', NULL, 3, true),
  ('a0000000-0000-0000-0000-000000000007', 'Duyurular', '/duyurular', NULL, 4, true),
  ('a0000000-0000-0000-0000-000000000008', 'Galeri', '/galeri', NULL, 5, true),
  ('a0000000-0000-0000-0000-000000000009', 'Şubelerimiz', '/subeler', NULL, 6, true),
  ('a0000000-0000-0000-0000-000000000010', 'İletişim', '/iletisim', NULL, 7, true);

-- Örnek Haberler
INSERT INTO news (title, slug, summary, content, is_published, published_at) VALUES
  (
    'Toplu İş Sözleşmesi Görüşmeleri Başladı',
    'toplu-is-sozlesmesi-gorusmeleri-basladi',
    'Sendikamız, 2026 yılı toplu iş sözleşmesi görüşmelerine başladı. Görüşmelerde çalışanların hakları ve iyileştirmeleri ele alınacak.',
    '<p>Sendikamız, 2026 yılı toplu iş sözleşmesi görüşmelerine bugün itibariyle resmi olarak başladı.</p><p>Görüşmelerde çalışanların <strong>ücret iyileştirmeleri</strong>, sosyal haklar ve çalışma koşulları ele alınacaktır. Sendikamız, tüm üyelerimizin haklarını en iyi şekilde korumak için kararlılıkla müzakerelere devam edecektir.</p><p>Gelişmeler hakkında üyelerimizi düzenli olarak bilgilendirmeye devam edeceğiz.</p>',
    true,
    now()
  ),
  (
    'Eğitim Seminerleri Programı Açıklandı',
    'egitim-seminerleri-programi-aciklandi',
    'Üyelerimiz için düzenlenen 2026 yılı eğitim seminerleri programı açıklandı. İş güvenliği ve mesleki gelişim konularında seminerler yapılacak.',
    '<p>Sendikamız, üyelerimizin mesleki gelişimlerine katkı sağlamak amacıyla <strong>2026 yılı eğitim seminerleri programını</strong> açıklamıştır.</p><p>Program kapsamında aşağıdaki konularda seminerler düzenlenecektir:</p><ul><li>İş Sağlığı ve Güvenliği</li><li>Çalışma Hukuku</li><li>Mesleki Gelişim</li><li>Dijital Okuryazarlık</li></ul><p>Katılım için şube temsilcilerinizle iletişime geçebilirsiniz.</p>',
    true,
    now() - interval '2 days'
  );

-- Örnek Duyurular
INSERT INTO announcements (title, slug, summary, content, is_published, published_at) VALUES
  (
    'Genel Kurul Toplantısı Daveti',
    'genel-kurul-toplantisi-daveti',
    'Sendikamızın olağan genel kurul toplantısı 15 Mayıs 2026 tarihinde gerçekleştirilecektir. Tüm üyelerimiz davetlidir.',
    '<p>Değerli üyelerimiz,</p><p>Sendikamızın <strong>Olağan Genel Kurul Toplantısı</strong> aşağıdaki tarih ve adreste gerçekleştirilecektir:</p><p><strong>Tarih:</strong> 15 Mayıs 2026, Cumartesi<br/><strong>Saat:</strong> 10:00<br/><strong>Yer:</strong> Sendika Genel Merkezi Konferans Salonu</p><p>Tüm üyelerimizin katılımı beklenmektedir.</p>',
    true,
    now()
  ),
  (
    'Aidatların Ödenmesine İlişkin Duyuru',
    'aidatlarin-odenmesine-iliskin-duyuru',
    'Üyelik aidatlarının zamanında ödenmesi konusunda üyelerimizi bilgilendirmek isteriz.',
    '<p>Değerli üyelerimiz,</p><p>2026 yılı üyelik aidatlarının <strong>her ayın 15''ine kadar</strong> ödenmesi gerekmektedir. Aidat ödemeleri için banka havalesi veya şube vezneleri kullanılabilir.</p><p>Detaylı bilgi için şubelerimizle iletişime geçebilirsiniz.</p>',
    true,
    now() - interval '3 days'
  );
