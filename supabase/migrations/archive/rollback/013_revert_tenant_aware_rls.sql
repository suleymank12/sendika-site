-- =====================================================
-- Migration 013: ROLLBACK script for 012_tenant_aware_rls
--
-- !!! BU DOSYA OTOMATİK UYGULANMAZ !!!
-- 012 sonrası kritik bir sorun çıkarsa Supabase SQL Editor'da
-- elle çalıştırılır. Repo'da rollback emniyeti olarak durur.
--
-- 001/002/004/009 migration'larındaki orijinal politikaları geri yükler,
-- 012'nin yarattığı politikaları ve fonksiyonu kaldırır.
-- =====================================================

BEGIN;

-- 1) Yeni tenant-aware policy'leri kaldır
DROP POLICY IF EXISTS "tenant_news_all" ON public.news;
DROP POLICY IF EXISTS "tenant_announcements_all" ON public.announcements;
DROP POLICY IF EXISTS "tenant_sliders_all" ON public.sliders;
DROP POLICY IF EXISTS "tenant_pages_all" ON public.pages;
DROP POLICY IF EXISTS "tenant_menu_items_all" ON public.menu_items;
DROP POLICY IF EXISTS "tenant_board_members_all" ON public.board_members;
DROP POLICY IF EXISTS "tenant_branches_all" ON public.branches;
DROP POLICY IF EXISTS "tenant_gallery_albums_all" ON public.gallery_albums;
DROP POLICY IF EXISTS "tenant_gallery_images_all" ON public.gallery_images;
DROP POLICY IF EXISTS "tenant_site_settings_all" ON public.site_settings;
DROP POLICY IF EXISTS "tenant_news_categories_all" ON public.news_categories;
DROP POLICY IF EXISTS "tenant_headlines_all" ON public.headlines;
DROP POLICY IF EXISTS "tenant_homepage_sections_all" ON public.homepage_sections;
DROP POLICY IF EXISTS "tenant_homepage_section_items_all" ON public.homepage_section_items;
DROP POLICY IF EXISTS "tenant_content_media_all" ON public.content_media;

DROP POLICY IF EXISTS "tenants_super_admin_insert" ON public.tenants;
DROP POLICY IF EXISTS "tenants_super_admin_update" ON public.tenants;
DROP POLICY IF EXISTS "tenants_super_admin_delete" ON public.tenants;

DROP POLICY IF EXISTS "tenant_users_self_or_super_select" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_super_admin_insert" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_super_admin_update" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_super_admin_delete" ON public.tenant_users;

-- 2) Eski tenant-agnostic policy'leri yeniden yarat (001, 002, 004, 009'dan)

CREATE POLICY "Admin: news all" ON public.news
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: announcements all" ON public.announcements
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: sliders all" ON public.sliders
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: pages all" ON public.pages
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: menu_items all" ON public.menu_items
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: board_members all" ON public.board_members
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: branches all" ON public.branches
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: gallery_albums all" ON public.gallery_albums
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: gallery_images all" ON public.gallery_images
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Admin: site_settings all" ON public.site_settings
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth full access categories" ON public.news_categories
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "headlines_auth_select" ON public.headlines
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "headlines_auth_insert" ON public.headlines
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "headlines_auth_update" ON public.headlines
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "headlines_auth_delete" ON public.headlines
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "Auth full access sections" ON public.homepage_sections
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth full access section items" ON public.homepage_section_items
  FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth full access media" ON public.content_media
  FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "tenants_auth_insert" ON public.tenants
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tenants_auth_update" ON public.tenants
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenants_auth_delete" ON public.tenants
  FOR DELETE TO authenticated USING (true);

CREATE POLICY "tenant_users_auth_select" ON public.tenant_users
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "tenant_users_auth_insert" ON public.tenant_users
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "tenant_users_auth_update" ON public.tenant_users
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "tenant_users_auth_delete" ON public.tenant_users
  FOR DELETE TO authenticated USING (true);

-- 3) user_has_tenant_access fonksiyonunu kaldır
DROP FUNCTION IF EXISTS public.user_has_tenant_access(UUID);

COMMIT;
