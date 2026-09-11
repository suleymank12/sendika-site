-- =============================================================================
-- 000_baseline.sql — CANLI SEMANIN TAM DOKUMU (uretilmis dosya, ELLE DUZENLEMEYIN)
-- =============================================================================
--
-- Uretim tarihi : 2026-09-11 19:52 UTC
-- Uretim araci  : scripts/dump-baseline.sh
-- pg_dump       : pg_dump (PostgreSQL) 17.11 (Ubuntu 17.11-1.pgdg22.04+2)
-- Sunucu        : PostgreSQL 17.6
--
-- Bu dosya 001-026 arasindaki migration'larin YERINE gecer. O dosyalar
-- sifirdan kurulum uretemiyordu (bkz. archive/README.md); tarihsel kayit
-- olarak archive/ altinda duruyor.
--
-- ICERIK: eklentiler + public sema (tablo/index/constraint/RLS/policy/
-- fonksiyon/trigger/GRANT/COMMENT) + storage.objects policy'leri +
-- rol bazli REVOKE'lar (Bolum D — pg_dump'in yazamadigi kisitlar).
-- VERI ICERMEZ. Tohum icin: 001_seed_default.sql (baseline'dan SONRA).
--
-- CALISTIRMA (KURULUM.md Adim 3):
--   psql "$PGURI" -v ON_ERROR_STOP=1 --single-transaction -f 000_baseline.sql
--   psql "$PGURI" -v ON_ERROR_STOP=1 --single-transaction -f 001_seed_default.sql
--
-- YENIDEN URETIM: sema degistiginde bu dosya ELLE DUZENLENMEZ. Once yeni
-- migration (027+) yazilir ve canliya uygulanir; baseline ancak dosyalar
-- birikince ayni script'le YENIDEN URETILIR. Gerekce: NOTE.md.
-- =============================================================================

-- =============================================================================
-- BOLUM A — EKLENTILER
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- =============================================================================
-- BOLUM B — public SEMASI (pg_dump ciktisi)
-- =============================================================================
-- Bilerek cikarilanlar (gerekce: dump-baseline.sh TEMIZLIK): CREATE/ALTER/
-- COMMENT ON SCHEMA public ve TUM ALTER DEFAULT PRIVILEGES satirlari.
-- Asagida govdesi bos kalan 'Type: SCHEMA', 'Type: COMMENT' ve
-- 'Type: DEFAULT ACL' basliklari bunlardan kalir.
--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11 (Ubuntu 17.11-1.pgdg22.04+2)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: is_super_admin(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_super_admin(user_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- !!! PARAMETRE GOLGELEME TUZAGI !!!
  -- Parametre adi "user_id", super_admins kolonu da "user_id".
  -- Nitelenmemis "WHERE user_id = user_id" yazilirsa kosul HER ZAMAN TRUE
  -- olur ve HERKES super admin olur. Bu yuzden:
  --   sol taraf  -> sa.user_id            (tablo kolonu, alias ile)
  --   sag taraf  -> is_super_admin.user_id (fonksiyon parametresi, fonksiyon
  --                                         adiyla nitelenmis)
  -- Dogrulama icin dosya sonundaki (b) sorgusunu MUTLAKA calistirin.
  SELECT EXISTS (
    SELECT 1
    FROM public.super_admins sa
    WHERE sa.user_id = is_super_admin.user_id
  );
$$;


--
-- Name: FUNCTION is_super_admin(user_id uuid); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.is_super_admin(user_id uuid) IS 'Kullanici super admin mi? Kaynak: public.super_admins (022). ONCEDEN user_metadata okunuyordu — kullanici kendi yazabildigi icin yetki yukseltmeye aciktir, ASLA geri donulmemeli.';


--
-- Name: prevent_default_tenant_deactivation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_default_tenant_deactivation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.slug = 'default' AND NEW.is_active = false THEN
    RAISE EXCEPTION 'Default tenant pasiflenemez (sistem icin gerekli)';
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: set_updated_at_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: user_has_tenant_access(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.user_has_tenant_access(tenant_id_param uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM public.tenant_users
      WHERE user_id = auth.uid() AND tenant_id = tenant_id_param
    )
    OR public.is_super_admin(auth.uid());
$$;


SET default_table_access_method = heap;

--
-- Name: announcements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.announcements (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    summary text,
    content text,
    cover_image text,
    is_published boolean DEFAULT false,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_headline boolean DEFAULT false,
    video_url text,
    youtube_url text,
    tenant_id uuid NOT NULL
);


--
-- Name: board_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.board_members (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    title text,
    photo text,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    slug text,
    bio text,
    phone text,
    email text,
    tenant_id uuid NOT NULL
);


--
-- Name: branches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.branches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    city text,
    address text,
    phone text,
    email text,
    is_active boolean DEFAULT true,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    slug text,
    manager_id uuid,
    manager_name text,
    manager_title text,
    manager_photo text,
    manager_bio text,
    manager_phone text,
    manager_email text,
    map_url text,
    working_hours text,
    description text,
    tenant_id uuid NOT NULL
);


--
-- Name: contact_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    ad text NOT NULL,
    email text NOT NULL,
    telefon text NOT NULL,
    mesaj text NOT NULL,
    okundu boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contact_messages_ad_len CHECK (((char_length(ad) >= 1) AND (char_length(ad) <= 100))),
    CONSTRAINT contact_messages_email_len CHECK (((char_length(email) >= 3) AND (char_length(email) <= 150))),
    CONSTRAINT contact_messages_mesaj_len CHECK (((char_length(mesaj) >= 1) AND (char_length(mesaj) <= 2000))),
    CONSTRAINT contact_messages_telefon_len CHECK (((char_length(telefon) >= 1) AND (char_length(telefon) <= 30)))
);


--
-- Name: contact_rate_limit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contact_rate_limit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    ip_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: content_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_media (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    content_type text NOT NULL,
    content_id uuid NOT NULL,
    media_type text DEFAULT 'image'::text NOT NULL,
    url text NOT NULL,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL,
    CONSTRAINT content_media_content_type_check CHECK ((content_type = ANY (ARRAY['news'::text, 'announcement'::text, 'page'::text, 'headline'::text]))),
    CONSTRAINT content_media_media_type_check CHECK ((media_type = ANY (ARRAY['image'::text, 'video'::text])))
);


--
-- Name: gallery_albums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_albums (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    cover_image text,
    "order" integer DEFAULT 0,
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: gallery_images; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_images (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    album_id uuid,
    image_url text NOT NULL,
    caption text,
    "order" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: headlines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.headlines (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    subtitle text,
    image_url text,
    link_url text,
    source_type text,
    source_id uuid,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    content text,
    video_url text,
    youtube_url text,
    tenant_id uuid NOT NULL
);


--
-- Name: homepage_section_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_section_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    section_id uuid,
    title text NOT NULL,
    description text,
    image_url text,
    link_url text,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    icon text,
    tenant_id uuid NOT NULL
);


--
-- Name: homepage_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.homepage_sections (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    section_type text DEFAULT 'custom'::text NOT NULL,
    source text DEFAULT 'custom'::text,
    item_count integer DEFAULT 4,
    layout text DEFAULT 'grid-4'::text,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: menu_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.menu_items (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    url text,
    parent_id uuid,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: news; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    summary text,
    content text,
    cover_image text,
    category text,
    is_published boolean DEFAULT false,
    published_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_headline boolean DEFAULT false,
    video_url text,
    youtube_url text,
    tenant_id uuid NOT NULL
);


--
-- Name: news_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.news_categories (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    slug text,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text NOT NULL,
    slug text NOT NULL,
    content text,
    is_published boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    cover_image text,
    video_url text,
    youtube_url text,
    tenant_id uuid NOT NULL
);


--
-- Name: site_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.site_settings (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    key text NOT NULL,
    value text,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: sliders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sliders (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    title text,
    subtitle text,
    image_url text NOT NULL,
    link_url text,
    "order" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: super_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.super_admins (
    user_id uuid NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: TABLE super_admins; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.super_admins IS 'Platform super admin listesi (tek dogruluk kaynagi). RLS acik + policy YOK = anon/authenticated erisemez. Yalnizca is_super_admin (SECURITY DEFINER) ve service role okur. Yeni super admin: INSERT ile eklenir.';


--
-- Name: tenant_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'admin'::text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    custom_domain text,
    logo_url text,
    favicon_url text,
    is_active boolean DEFAULT true,
    enabled_modules jsonb DEFAULT '{"donations": false, "membership": false}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: announcements announcements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);


--
-- Name: announcements announcements_tenant_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_tenant_slug_key UNIQUE (tenant_id, slug);


--
-- Name: board_members board_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_members
    ADD CONSTRAINT board_members_pkey PRIMARY KEY (id);


--
-- Name: branches branches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_pkey PRIMARY KEY (id);


--
-- Name: contact_messages contact_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_pkey PRIMARY KEY (id);


--
-- Name: contact_rate_limit contact_rate_limit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_rate_limit
    ADD CONSTRAINT contact_rate_limit_pkey PRIMARY KEY (id);


--
-- Name: content_media content_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_media
    ADD CONSTRAINT content_media_pkey PRIMARY KEY (id);


--
-- Name: gallery_albums gallery_albums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_albums
    ADD CONSTRAINT gallery_albums_pkey PRIMARY KEY (id);


--
-- Name: gallery_images gallery_images_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_pkey PRIMARY KEY (id);


--
-- Name: headlines headlines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.headlines
    ADD CONSTRAINT headlines_pkey PRIMARY KEY (id);


--
-- Name: homepage_section_items homepage_section_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_section_items
    ADD CONSTRAINT homepage_section_items_pkey PRIMARY KEY (id);


--
-- Name: homepage_sections homepage_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sections
    ADD CONSTRAINT homepage_sections_pkey PRIMARY KEY (id);


--
-- Name: menu_items menu_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_pkey PRIMARY KEY (id);


--
-- Name: news_categories news_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_categories
    ADD CONSTRAINT news_categories_pkey PRIMARY KEY (id);


--
-- Name: news_categories news_categories_tenant_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_categories
    ADD CONSTRAINT news_categories_tenant_slug_key UNIQUE (tenant_id, slug);


--
-- Name: news news_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_pkey PRIMARY KEY (id);


--
-- Name: news news_tenant_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_tenant_slug_key UNIQUE (tenant_id, slug);


--
-- Name: pages pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_pkey PRIMARY KEY (id);


--
-- Name: pages pages_tenant_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_tenant_slug_key UNIQUE (tenant_id, slug);


--
-- Name: site_settings site_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_pkey PRIMARY KEY (id);


--
-- Name: site_settings site_settings_tenant_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_tenant_key_key UNIQUE (tenant_id, key);


--
-- Name: sliders sliders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sliders
    ADD CONSTRAINT sliders_pkey PRIMARY KEY (id);


--
-- Name: super_admins super_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_admins
    ADD CONSTRAINT super_admins_pkey PRIMARY KEY (user_id);


--
-- Name: tenant_users tenant_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_pkey PRIMARY KEY (id);


--
-- Name: tenant_users tenant_users_tenant_id_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_user_id_key UNIQUE (tenant_id, user_id);


--
-- Name: tenants tenants_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_custom_domain_key UNIQUE (custom_domain);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: board_members_tenant_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX board_members_tenant_slug_unique ON public.board_members USING btree (tenant_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: branches_tenant_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX branches_tenant_slug_unique ON public.branches USING btree (tenant_id, slug) WHERE (slug IS NOT NULL);


--
-- Name: idx_announcements_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_published ON public.announcements USING btree (is_published, published_at DESC);


--
-- Name: idx_announcements_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_slug ON public.announcements USING btree (slug);


--
-- Name: idx_announcements_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_announcements_tenant ON public.announcements USING btree (tenant_id);


--
-- Name: idx_board_members_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_board_members_tenant ON public.board_members USING btree (tenant_id);


--
-- Name: idx_branches_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_branches_tenant ON public.branches USING btree (tenant_id);


--
-- Name: idx_contact_messages_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_messages_tenant_created ON public.contact_messages USING btree (tenant_id, created_at DESC);


--
-- Name: idx_contact_messages_tenant_okundu; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_messages_tenant_okundu ON public.contact_messages USING btree (tenant_id, okundu);


--
-- Name: idx_contact_rate_limit_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contact_rate_limit_lookup ON public.contact_rate_limit USING btree (tenant_id, ip_hash, created_at);


--
-- Name: idx_content_media_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_media_lookup ON public.content_media USING btree (content_type, content_id);


--
-- Name: idx_content_media_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_media_tenant ON public.content_media USING btree (tenant_id);


--
-- Name: idx_gallery_albums_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_albums_tenant ON public.gallery_albums USING btree (tenant_id);


--
-- Name: idx_gallery_images_album; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_images_album ON public.gallery_images USING btree (album_id);


--
-- Name: idx_gallery_images_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_images_tenant ON public.gallery_images USING btree (tenant_id);


--
-- Name: idx_headlines_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_headlines_tenant ON public.headlines USING btree (tenant_id);


--
-- Name: idx_homepage_section_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_section_items_tenant ON public.homepage_section_items USING btree (tenant_id);


--
-- Name: idx_homepage_sections_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_homepage_sections_tenant ON public.homepage_sections USING btree (tenant_id);


--
-- Name: idx_menu_items_order; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_order ON public.menu_items USING btree ("order");


--
-- Name: idx_menu_items_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_parent ON public.menu_items USING btree (parent_id);


--
-- Name: idx_menu_items_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_menu_items_tenant ON public.menu_items USING btree (tenant_id);


--
-- Name: idx_news_categories_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_categories_tenant ON public.news_categories USING btree (tenant_id);


--
-- Name: idx_news_published; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_published ON public.news USING btree (is_published, published_at DESC);


--
-- Name: idx_news_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_slug ON public.news USING btree (slug);


--
-- Name: idx_news_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_news_tenant ON public.news USING btree (tenant_id);


--
-- Name: idx_pages_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_slug ON public.pages USING btree (slug);


--
-- Name: idx_pages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pages_tenant ON public.pages USING btree (tenant_id);


--
-- Name: idx_site_settings_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_settings_key ON public.site_settings USING btree (key);


--
-- Name: idx_site_settings_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_settings_tenant ON public.site_settings USING btree (tenant_id);


--
-- Name: idx_site_settings_tenant_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_site_settings_tenant_key ON public.site_settings USING btree (tenant_id, key);


--
-- Name: idx_sliders_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sliders_tenant ON public.sliders USING btree (tenant_id);


--
-- Name: idx_tenant_users_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_users_tenant ON public.tenant_users USING btree (tenant_id);


--
-- Name: idx_tenant_users_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_users_user ON public.tenant_users USING btree (user_id);


--
-- Name: tenants protect_default_tenant_active; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER protect_default_tenant_active BEFORE UPDATE ON public.tenants FOR EACH ROW WHEN ((old.slug = 'default'::text)) EXECUTE FUNCTION public.prevent_default_tenant_deactivation();


--
-- Name: tenants trg_tenants_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_timestamp();


--
-- Name: announcements announcements_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.announcements
    ADD CONSTRAINT announcements_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: board_members board_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.board_members
    ADD CONSTRAINT board_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: branches branches_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.board_members(id) ON DELETE SET NULL;


--
-- Name: branches branches_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.branches
    ADD CONSTRAINT branches_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_messages contact_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_messages
    ADD CONSTRAINT contact_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: contact_rate_limit contact_rate_limit_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contact_rate_limit
    ADD CONSTRAINT contact_rate_limit_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: content_media content_media_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_media
    ADD CONSTRAINT content_media_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: gallery_albums gallery_albums_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_albums
    ADD CONSTRAINT gallery_albums_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: gallery_images gallery_images_album_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.gallery_albums(id) ON DELETE CASCADE;


--
-- Name: gallery_images gallery_images_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_images
    ADD CONSTRAINT gallery_images_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: headlines headlines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.headlines
    ADD CONSTRAINT headlines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: homepage_section_items homepage_section_items_section_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_section_items
    ADD CONSTRAINT homepage_section_items_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.homepage_sections(id) ON DELETE CASCADE;


--
-- Name: homepage_section_items homepage_section_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_section_items
    ADD CONSTRAINT homepage_section_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: homepage_sections homepage_sections_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.homepage_sections
    ADD CONSTRAINT homepage_sections_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: menu_items menu_items_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;


--
-- Name: menu_items menu_items_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.menu_items
    ADD CONSTRAINT menu_items_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: news_categories news_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news_categories
    ADD CONSTRAINT news_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: news news_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.news
    ADD CONSTRAINT news_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: pages pages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pages
    ADD CONSTRAINT pages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: site_settings site_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.site_settings
    ADD CONSTRAINT site_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: sliders sliders_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sliders
    ADD CONSTRAINT sliders_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: super_admins super_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.super_admins
    ADD CONSTRAINT super_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: tenant_users tenant_users_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: tenant_users tenant_users_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_users
    ADD CONSTRAINT tenant_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: news_categories Public read active categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public read active categories" ON public.news_categories FOR SELECT USING ((is_active = true));


--
-- Name: announcements Public: announcements select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: announcements select" ON public.announcements FOR SELECT USING ((is_published = true));


--
-- Name: gallery_albums Public: gallery_albums select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: gallery_albums select" ON public.gallery_albums FOR SELECT USING ((is_published = true));


--
-- Name: gallery_images Public: gallery_images select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: gallery_images select" ON public.gallery_images FOR SELECT USING ((EXISTS ( SELECT 1
   FROM public.gallery_albums a
  WHERE ((a.id = gallery_images.album_id) AND (a.is_published = true)))));


--
-- Name: menu_items Public: menu_items select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: menu_items select" ON public.menu_items FOR SELECT USING ((is_active = true));


--
-- Name: news Public: news select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: news select" ON public.news FOR SELECT USING ((is_published = true));


--
-- Name: pages Public: pages select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: pages select" ON public.pages FOR SELECT USING ((is_published = true));


--
-- Name: site_settings Public: site_settings select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: site_settings select" ON public.site_settings FOR SELECT USING (true);


--
-- Name: sliders Public: sliders select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Public: sliders select" ON public.sliders FOR SELECT USING ((is_active = true));


--
-- Name: announcements; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

--
-- Name: board_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.board_members ENABLE ROW LEVEL SECURITY;

--
-- Name: branches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: contact_rate_limit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contact_rate_limit ENABLE ROW LEVEL SECURITY;

--
-- Name: content_media; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.content_media ENABLE ROW LEVEL SECURITY;

--
-- Name: content_media content_media_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY content_media_public_read ON public.content_media FOR SELECT USING (
CASE content_type
    WHEN 'news'::text THEN (EXISTS ( SELECT 1
       FROM public.news n
      WHERE ((n.id = content_media.content_id) AND (n.is_published = true))))
    WHEN 'announcement'::text THEN (EXISTS ( SELECT 1
       FROM public.announcements an
      WHERE ((an.id = content_media.content_id) AND (an.is_published = true))))
    WHEN 'page'::text THEN (EXISTS ( SELECT 1
       FROM public.pages p
      WHERE ((p.id = content_media.content_id) AND (p.is_published = true))))
    WHEN 'headline'::text THEN (EXISTS ( SELECT 1
       FROM public.headlines h
      WHERE ((h.id = content_media.content_id) AND (h.is_active = true))))
    ELSE false
END);


--
-- Name: gallery_albums; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gallery_albums ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_images; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gallery_images ENABLE ROW LEVEL SECURITY;

--
-- Name: headlines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.headlines ENABLE ROW LEVEL SECURITY;

--
-- Name: headlines headlines_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY headlines_public_select ON public.headlines FOR SELECT USING ((is_active = true));


--
-- Name: homepage_section_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_section_items ENABLE ROW LEVEL SECURITY;

--
-- Name: homepage_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: menu_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;

--
-- Name: news; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;

--
-- Name: news_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.news_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

--
-- Name: site_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.site_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: sliders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sliders ENABLE ROW LEVEL SECURITY;

--
-- Name: super_admins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

--
-- Name: announcements tenant_announcements_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_announcements_all ON public.announcements TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: board_members tenant_board_members_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_board_members_all ON public.board_members TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: branches tenant_branches_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_branches_all ON public.branches TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: contact_messages tenant_contact_messages_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_contact_messages_all ON public.contact_messages TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: content_media tenant_content_media_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_content_media_all ON public.content_media TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: gallery_albums tenant_gallery_albums_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_gallery_albums_all ON public.gallery_albums TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: gallery_images tenant_gallery_images_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_gallery_images_all ON public.gallery_images TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: headlines tenant_headlines_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_headlines_all ON public.headlines TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: homepage_section_items tenant_homepage_section_items_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_homepage_section_items_all ON public.homepage_section_items TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: homepage_sections tenant_homepage_sections_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_homepage_sections_all ON public.homepage_sections TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: menu_items tenant_menu_items_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_menu_items_all ON public.menu_items TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: news tenant_news_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_news_all ON public.news TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: news_categories tenant_news_categories_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_news_categories_all ON public.news_categories TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: pages tenant_pages_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_pages_all ON public.pages TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: site_settings tenant_site_settings_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_site_settings_all ON public.site_settings TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: sliders tenant_sliders_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_sliders_all ON public.sliders TO authenticated USING (public.user_has_tenant_access(tenant_id)) WITH CHECK (public.user_has_tenant_access(tenant_id));


--
-- Name: tenant_users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_users ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_users tenant_users_self_or_super_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_users_self_or_super_select ON public.tenant_users FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR public.is_super_admin(auth.uid())));


--
-- Name: tenant_users tenant_users_super_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_users_super_admin_delete ON public.tenant_users FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: tenant_users tenant_users_super_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_users_super_admin_insert ON public.tenant_users FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: tenant_users tenant_users_super_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_users_super_admin_update ON public.tenant_users FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_public_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_public_select ON public.tenants FOR SELECT USING (true);


--
-- Name: tenants tenants_super_admin_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_super_admin_delete ON public.tenants FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));


--
-- Name: tenants tenants_super_admin_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_super_admin_insert ON public.tenants FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: tenants tenants_super_admin_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_super_admin_update ON public.tenants FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION is_super_admin(user_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.is_super_admin(user_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.is_super_admin(user_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.is_super_admin(user_id uuid) TO service_role;


--
-- Name: FUNCTION prevent_default_tenant_deactivation(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.prevent_default_tenant_deactivation() TO anon;
GRANT ALL ON FUNCTION public.prevent_default_tenant_deactivation() TO authenticated;
GRANT ALL ON FUNCTION public.prevent_default_tenant_deactivation() TO service_role;


--
-- Name: FUNCTION set_updated_at_timestamp(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at_timestamp() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at_timestamp() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at_timestamp() TO service_role;


--
-- Name: FUNCTION user_has_tenant_access(tenant_id_param uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.user_has_tenant_access(tenant_id_param uuid) TO anon;
GRANT ALL ON FUNCTION public.user_has_tenant_access(tenant_id_param uuid) TO authenticated;
GRANT ALL ON FUNCTION public.user_has_tenant_access(tenant_id_param uuid) TO service_role;


--
-- Name: TABLE announcements; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.announcements TO anon;
GRANT ALL ON TABLE public.announcements TO authenticated;
GRANT ALL ON TABLE public.announcements TO service_role;


--
-- Name: TABLE board_members; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.board_members TO anon;
GRANT ALL ON TABLE public.board_members TO authenticated;
GRANT ALL ON TABLE public.board_members TO service_role;


--
-- Name: TABLE branches; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.branches TO anon;
GRANT ALL ON TABLE public.branches TO authenticated;
GRANT ALL ON TABLE public.branches TO service_role;


--
-- Name: TABLE contact_messages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_messages TO anon;
GRANT ALL ON TABLE public.contact_messages TO authenticated;
GRANT ALL ON TABLE public.contact_messages TO service_role;


--
-- Name: TABLE contact_rate_limit; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.contact_rate_limit TO anon;
GRANT ALL ON TABLE public.contact_rate_limit TO authenticated;
GRANT ALL ON TABLE public.contact_rate_limit TO service_role;


--
-- Name: TABLE content_media; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.content_media TO anon;
GRANT ALL ON TABLE public.content_media TO authenticated;
GRANT ALL ON TABLE public.content_media TO service_role;


--
-- Name: TABLE gallery_albums; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gallery_albums TO anon;
GRANT ALL ON TABLE public.gallery_albums TO authenticated;
GRANT ALL ON TABLE public.gallery_albums TO service_role;


--
-- Name: TABLE gallery_images; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.gallery_images TO anon;
GRANT ALL ON TABLE public.gallery_images TO authenticated;
GRANT ALL ON TABLE public.gallery_images TO service_role;


--
-- Name: TABLE headlines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.headlines TO anon;
GRANT ALL ON TABLE public.headlines TO authenticated;
GRANT ALL ON TABLE public.headlines TO service_role;


--
-- Name: TABLE homepage_section_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.homepage_section_items TO anon;
GRANT ALL ON TABLE public.homepage_section_items TO authenticated;
GRANT ALL ON TABLE public.homepage_section_items TO service_role;


--
-- Name: TABLE homepage_sections; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.homepage_sections TO anon;
GRANT ALL ON TABLE public.homepage_sections TO authenticated;
GRANT ALL ON TABLE public.homepage_sections TO service_role;


--
-- Name: TABLE menu_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.menu_items TO anon;
GRANT ALL ON TABLE public.menu_items TO authenticated;
GRANT ALL ON TABLE public.menu_items TO service_role;


--
-- Name: TABLE news; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.news TO anon;
GRANT ALL ON TABLE public.news TO authenticated;
GRANT ALL ON TABLE public.news TO service_role;


--
-- Name: TABLE news_categories; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.news_categories TO anon;
GRANT ALL ON TABLE public.news_categories TO authenticated;
GRANT ALL ON TABLE public.news_categories TO service_role;


--
-- Name: TABLE pages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.pages TO anon;
GRANT ALL ON TABLE public.pages TO authenticated;
GRANT ALL ON TABLE public.pages TO service_role;


--
-- Name: TABLE site_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.site_settings TO anon;
GRANT ALL ON TABLE public.site_settings TO authenticated;
GRANT ALL ON TABLE public.site_settings TO service_role;


--
-- Name: TABLE sliders; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.sliders TO anon;
GRANT ALL ON TABLE public.sliders TO authenticated;
GRANT ALL ON TABLE public.sliders TO service_role;


--
-- Name: TABLE super_admins; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.super_admins TO anon;
GRANT ALL ON TABLE public.super_admins TO authenticated;
GRANT ALL ON TABLE public.super_admins TO service_role;


--
-- Name: TABLE tenant_users; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenant_users TO anon;
GRANT ALL ON TABLE public.tenant_users TO authenticated;
GRANT ALL ON TABLE public.tenant_users TO service_role;


--
-- Name: TABLE tenants; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tenants TO anon;
GRANT ALL ON TABLE public.tenants TO authenticated;
GRANT ALL ON TABLE public.tenants TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--



--
-- PostgreSQL database dump complete
--



-- =============================================================================
-- BOLUM C — storage.objects POLICY'LERI
-- =============================================================================
-- Kaynak: canli pg_policies (pg_dump storage semasini getiremez).
-- Ifadeler search_path='' ile uretildi: fonksiyonlar semasiyla yazili
-- (public.user_has_tenant_access) ve Bolum B'nin bos search_path'inde cozulur.
-- Policy'ler bucket_id degerine bakar; 'images' bucket'inin bu dosyadan
-- once olusturulmasi SART DEGIL, ama yukleme yapilmadan once olmali
-- (KURULUM.md Adim 4).
-- Yetki hatasi (must be owner of table objects) alinirsa policy'ler
-- Dashboard > Storage > Policies ekranindan elle kurulur.
-- Eski Dashboard isimleri (varsa) temizlenir:
DROP POLICY IF EXISTS "Public read access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

DROP POLICY IF EXISTS images_public_read ON storage.objects;
CREATE POLICY images_public_read ON storage.objects
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((bucket_id = 'images'::text));

DROP POLICY IF EXISTS images_tenant_delete ON storage.objects;
CREATE POLICY images_tenant_delete ON storage.objects
  AS PERMISSIVE
  FOR DELETE
  TO authenticated
  USING (((bucket_id = 'images'::text) AND (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'::text) AND public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)));

DROP POLICY IF EXISTS images_tenant_insert ON storage.objects;
CREATE POLICY images_tenant_insert ON storage.objects
  AS PERMISSIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (((bucket_id = 'images'::text) AND (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'::text) AND public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)));

DROP POLICY IF EXISTS images_tenant_update ON storage.objects;
CREATE POLICY images_tenant_update ON storage.objects
  AS PERMISSIVE
  FOR UPDATE
  TO authenticated
  USING (((bucket_id = 'images'::text) AND (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'::text) AND public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)))
  WITH CHECK (((bucket_id = 'images'::text) AND (name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'::text) AND public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)));


-- =============================================================================
-- BOLUM D — ROL BAZLI REVOKE'LAR (pg_dump'in yazamadigi kisitlar)
-- =============================================================================
-- Kaynak: canli pg_proc. Canlida ilgili rolun EXECUTE'u OLMAYAN her public
-- fonksiyon icin bir satir. Neden: pg_dump ACL'i PostgreSQL'in sabit
-- varsayilanina (sahip + PUBLIC) gore fark olarak yazar ve bir rolun
-- YOKLUGUNU yazamaz. Bu proje ise fonksiyonlari Supabase'in ALTER DEFAULT
-- PRIVILEGES'i altinda yaratir: anon/authenticated/service_role EXECUTE'u
-- CREATE aninda alir ve Bolum B'deki 'REVOKE ... FROM PUBLIC' bunlari
-- KALDIRMAZ. Bu satirlar olmadan canlida 022 ile anon'dan alinan
-- is_super_admin EXECUTE'u yeni kurulumda GERI GELIR (tatbikat BUG 3).
-- Dogrulama: KURULUM.md Adim 11, sorgu 4 (anon -> false).
REVOKE ALL ON FUNCTION public.is_super_admin(uuid) FROM anon;

-- =============================================================================
-- 000_baseline.sql sonu
-- =============================================================================
