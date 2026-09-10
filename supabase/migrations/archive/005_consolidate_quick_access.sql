-- ============================================================
-- 005_consolidate_quick_access.sql
-- Hızlı Erişim modülünü Anasayfa Bölümleri ile birleştir.
--
-- - homepage_section_items'a icon kolonu eklenir.
-- - Mevcut quick_access kayıtları:
--     * content'i olanlar pages tablosuna taşınır (varsa slug çakışması "qa-" prefix'i ile çözülür).
--     * Hepsi yeni bir "Hızlı Erişim" homepage_section'ın item'ı olarak insert edilir.
-- - quick_access tablosu BU MIGRATION'DA SİLİNMEZ (geri alınabilirlik için).
--   Doğrulama sonrası 006_drop_quick_access.sql ile drop edilecek.
-- ============================================================

-- 1) icon kolonu (idempotent)
ALTER TABLE homepage_section_items
  ADD COLUMN IF NOT EXISTS icon TEXT;

-- 1b) pages tablosundaki olası eksik kolonlar (Page interface ile uyumlu hale getir)
-- Quick access'ten içerik taşıyabilmek için bu kolonlar gerekli.
ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS cover_image TEXT,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS youtube_url TEXT;

-- 2) Veri taşıma (yalnızca quick_access tablosu varsa ve içinde kayıt varsa)
DO $$
DECLARE
  qa RECORD;
  new_section_id UUID;
  target_slug TEXT;
  target_url TEXT;
  page_exists BOOLEAN;
BEGIN
  -- quick_access tablosu yoksa atla (idempotent)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'quick_access'
  ) THEN
    RAISE NOTICE 'quick_access tablosu yok, taşıma atlandı.';
    RETURN;
  END IF;

  -- Zaten taşıma yapılmış mı? "Hızlı Erişim" başlıklı bir section varsa atla.
  IF EXISTS (SELECT 1 FROM homepage_sections WHERE title = 'Hızlı Erişim') THEN
    RAISE NOTICE 'Hızlı Erişim section zaten var, taşıma atlandı.';
    RETURN;
  END IF;

  -- Hiç quick_access kaydı yoksa atla
  IF NOT EXISTS (SELECT 1 FROM quick_access LIMIT 1) THEN
    RAISE NOTICE 'quick_access boş, taşıma atlandı.';
    RETURN;
  END IF;

  -- "Hızlı Erişim" homepage_section'ını oluştur (en başa: order = 0, var olanları kaydır)
  UPDATE homepage_sections SET "order" = "order" + 1 WHERE "order" >= 0;

  INSERT INTO homepage_sections (title, section_type, source, item_count, layout, "order", is_active)
  VALUES ('Hızlı Erişim', 'custom', 'custom', 8, 'grid-8', 0, true)
  RETURNING id INTO new_section_id;

  -- Her quick_access kaydı için işle
  FOR qa IN SELECT * FROM quick_access ORDER BY "order" ASC, created_at ASC LOOP

    target_slug := NULLIF(trim(qa.slug), '');
    target_url := NULL;

    -- İçerik varsa pages tablosuna taşı
    IF qa.content IS NOT NULL AND length(trim(qa.content)) > 0 AND target_slug IS NOT NULL THEN
      -- Slug çakışması var mı?
      SELECT EXISTS (SELECT 1 FROM pages WHERE slug = target_slug) INTO page_exists;
      IF page_exists THEN
        target_slug := 'qa-' || target_slug;
        -- İkinci kez çakışırsa sondaki id parçasıyla benzersizleştir
        IF EXISTS (SELECT 1 FROM pages WHERE slug = target_slug) THEN
          target_slug := target_slug || '-' || substring(qa.id::text from 1 for 8);
        END IF;
      END IF;

      INSERT INTO pages (title, slug, content, cover_image, video_url, youtube_url, is_published, created_at, updated_at)
      VALUES (
        qa.title,
        target_slug,
        qa.content,
        qa.image_url,
        qa.video_url,
        qa.youtube_url,
        true,
        qa.created_at,
        now()
      );

      target_url := '/sayfa/' || target_slug;
    ELSE
      -- İçerik yoksa: kullanıcının manuel girdiği url'i kullan; yoksa # (broken link, admin sonradan düzeltir)
      IF qa.url IS NOT NULL AND length(trim(qa.url)) > 0 AND qa.url <> '/hizli-erisim/' || COALESCE(qa.slug, '') THEN
        target_url := qa.url;
      ELSE
        target_url := '#';
      END IF;
    END IF;

    INSERT INTO homepage_section_items (section_id, title, image_url, link_url, icon, "order", is_active, created_at)
    VALUES (
      new_section_id,
      qa.title,
      qa.image_url,
      target_url,
      qa.icon,
      qa."order",
      qa.is_active,
      qa.created_at
    );

  END LOOP;

  RAISE NOTICE 'quick_access taşıması tamamlandı. Yeni section id: %', new_section_id;
END $$;
