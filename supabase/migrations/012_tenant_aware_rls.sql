-- =====================================================
-- Migration 012: Tenant-aware RLS policies
-- - user_has_tenant_access SECURITY DEFINER fonksiyonu kuruluyor
-- - 15 içerik tablosunun eski tenant-agnostic policy'leri yenisiyle değişiyor
-- - tenants ve tenant_users için süper admin guard'lı policy'ler
-- - Public SELECT politikalarına dokunulmuyor (anon erişimi korunuyor)
-- =====================================================

BEGIN;

-- =====================================================
-- 1) YARDIMCI FONKSİYON
-- =====================================================

CREATE OR REPLACE FUNCTION public.user_has_tenant_access(tenant_id_param UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE user_id = auth.uid() AND tenant_id = tenant_id_param
    )
    OR public.is_super_admin(auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.user_has_tenant_access(UUID) TO authenticated;

-- =====================================================
-- 2) İÇERİK TABLOLARI — Eski "Admin/Auth" policy'leri DROP, yeni tenant-aware policy CREATE
-- =====================================================

-- news
DROP POLICY IF EXISTS "Admin: news all" ON public.news;
CREATE POLICY "tenant_news_all" ON public.news
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- announcements
DROP POLICY IF EXISTS "Admin: announcements all" ON public.announcements;
CREATE POLICY "tenant_announcements_all" ON public.announcements
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- sliders
DROP POLICY IF EXISTS "Admin: sliders all" ON public.sliders;
CREATE POLICY "tenant_sliders_all" ON public.sliders
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- pages
DROP POLICY IF EXISTS "Admin: pages all" ON public.pages;
CREATE POLICY "tenant_pages_all" ON public.pages
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- menu_items
DROP POLICY IF EXISTS "Admin: menu_items all" ON public.menu_items;
CREATE POLICY "tenant_menu_items_all" ON public.menu_items
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- board_members
DROP POLICY IF EXISTS "Admin: board_members all" ON public.board_members;
CREATE POLICY "tenant_board_members_all" ON public.board_members
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- branches
DROP POLICY IF EXISTS "Admin: branches all" ON public.branches;
CREATE POLICY "tenant_branches_all" ON public.branches
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- gallery_albums
DROP POLICY IF EXISTS "Admin: gallery_albums all" ON public.gallery_albums;
CREATE POLICY "tenant_gallery_albums_all" ON public.gallery_albums
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- gallery_images
DROP POLICY IF EXISTS "Admin: gallery_images all" ON public.gallery_images;
CREATE POLICY "tenant_gallery_images_all" ON public.gallery_images
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- site_settings
DROP POLICY IF EXISTS "Admin: site_settings all" ON public.site_settings;
CREATE POLICY "tenant_site_settings_all" ON public.site_settings
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- news_categories
DROP POLICY IF EXISTS "Auth full access categories" ON public.news_categories;
CREATE POLICY "tenant_news_categories_all" ON public.news_categories
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- headlines (002'de 4 ayrı policy var, hepsi drop)
DROP POLICY IF EXISTS "headlines_auth_select" ON public.headlines;
DROP POLICY IF EXISTS "headlines_auth_insert" ON public.headlines;
DROP POLICY IF EXISTS "headlines_auth_update" ON public.headlines;
DROP POLICY IF EXISTS "headlines_auth_delete" ON public.headlines;
CREATE POLICY "tenant_headlines_all" ON public.headlines
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- homepage_sections (Dashboard'da policy ismi "Auth full access sections")
DROP POLICY IF EXISTS "Auth full access sections" ON public.homepage_sections;
CREATE POLICY "tenant_homepage_sections_all" ON public.homepage_sections
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- homepage_section_items (Dashboard'da policy ismi "Auth full access section items")
DROP POLICY IF EXISTS "Auth full access section items" ON public.homepage_section_items;
CREATE POLICY "tenant_homepage_section_items_all" ON public.homepage_section_items
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- content_media (Dashboard'da policy ismi "Auth full access media")
DROP POLICY IF EXISTS "Auth full access media" ON public.content_media;
CREATE POLICY "tenant_content_media_all" ON public.content_media
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

-- =====================================================
-- 3) TENANTS — Süper admin guard'lı CRUD
-- =====================================================

-- Public SELECT KORUNUR (subdomain → tenant lookup için anon erişim şart)
-- tenants_public_select USING(true) policy'sine DOKUNULMUYOR

DROP POLICY IF EXISTS "tenants_auth_insert" ON public.tenants;
DROP POLICY IF EXISTS "tenants_auth_update" ON public.tenants;
DROP POLICY IF EXISTS "tenants_auth_delete" ON public.tenants;

CREATE POLICY "tenants_super_admin_insert" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenants_super_admin_update" ON public.tenants
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenants_super_admin_delete" ON public.tenants
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- =====================================================
-- 4) TENANT_USERS — Kendi üyelik görme + süper admin CRUD
-- =====================================================

DROP POLICY IF EXISTS "tenant_users_auth_select" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_auth_insert" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_auth_update" ON public.tenant_users;
DROP POLICY IF EXISTS "tenant_users_auth_delete" ON public.tenant_users;

CREATE POLICY "tenant_users_self_or_super_select" ON public.tenant_users
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_users_super_admin_insert" ON public.tenant_users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_users_super_admin_update" ON public.tenant_users
  FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "tenant_users_super_admin_delete" ON public.tenant_users
  FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

COMMIT;
