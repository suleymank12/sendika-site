import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import { buildTenantPublicUrl } from "@/lib/tenant-url";

// Tenant header'ina (x-tenant-slug) bagli oldugu icin statik render edilemez.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const tenant = await getCurrentTenant();

  // Pasif tenant: bos urlset (SEO icin "indekslenecek icerik yok" sinyali).
  // Erken donus — DB'ye hic gidilmez.
  if (!tenant.is_active) {
    return [];
  }

  const baseUrl = buildTenantPublicUrl(tenant);

  // createAdminClient (RLS bypass) kasitli: tenant izolasyonu manuel
  // .eq("tenant_id") filtresiyle saglaniyor.
  const supabase = createAdminClient();

  const [newsRes, announcementsRes, pagesRes, albumsRes] = await Promise.all([
    supabase
      .from("news")
      .select("slug, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true),
    supabase
      .from("announcements")
      .select("slug, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true),
    supabase
      .from("pages")
      .select("slug, updated_at")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true),
    supabase
      .from("gallery_albums")
      .select("id, created_at")
      .eq("tenant_id", tenant.id)
      .eq("is_published", true),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/haberler`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/duyurular`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/kurumsal/hakkimizda`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/kurumsal/tuzuk`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/kurumsal/misyon-vizyon`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/kurumsal/yonetim-kurulu`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/galeri`, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/subeler`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/iletisim`, changeFrequency: "monthly", priority: 0.6 },
  ];

  const newsPages: MetadataRoute.Sitemap = (newsRes.data || []).map((item) => ({
    url: `${baseUrl}/haberler/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const announcementPages: MetadataRoute.Sitemap = (announcementsRes.data || []).map((item) => ({
    url: `${baseUrl}/duyurular/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const dynamicPages: MetadataRoute.Sitemap = (pagesRes.data || []).map((item) => ({
    url: `${baseUrl}/sayfa/${item.slug}`,
    lastModified: new Date(item.updated_at),
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const albumPages: MetadataRoute.Sitemap = (albumsRes.data || []).map((item) => ({
    url: `${baseUrl}/galeri/${item.id}`,
    lastModified: new Date(item.created_at),
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [...staticPages, ...newsPages, ...announcementPages, ...dynamicPages, ...albumPages];
}
