import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://sendika.org.tr";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = createAdminClient();

  const [newsRes, announcementsRes, pagesRes, albumsRes] = await Promise.all([
    supabase.from("news").select("slug, updated_at").eq("is_published", true),
    supabase.from("announcements").select("slug, updated_at").eq("is_published", true),
    supabase.from("pages").select("slug, updated_at").eq("is_published", true),
    supabase.from("gallery_albums").select("id, created_at").eq("is_published", true),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/haberler`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/duyurular`, changeFrequency: "daily", priority: 0.9 },
    { url: `${BASE_URL}/kurumsal/hakkimizda`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/kurumsal/tuzuk`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/kurumsal/misyon-vizyon`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/kurumsal/yonetim-kurulu`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${BASE_URL}/galeri`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${BASE_URL}/subeler`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE_URL}/iletisim`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const newsPages: MetadataRoute.Sitemap = (newsRes.data || []).map((item) => ({
    url: `${BASE_URL}/haberler/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const announcementPages: MetadataRoute.Sitemap = (announcementsRes.data || []).map((item) => ({
    url: `${BASE_URL}/duyurular/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const dynamicPages: MetadataRoute.Sitemap = (pagesRes.data || []).map((item) => ({
    url: `${BASE_URL}/sayfa/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const albumPages: MetadataRoute.Sitemap = (albumsRes.data || []).map((item) => ({
    url: `${BASE_URL}/galeri/${item.id}`,
    lastModified: new Date(item.created_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticPages, ...newsPages, ...announcementPages, ...dynamicPages, ...albumPages];
}
