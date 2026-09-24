import { MetadataRoute } from "next";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import { buildTenantPublicUrl } from "@/lib/tenant-url";

// Tenant header'ina (x-tenant-slug) bagli oldugu icin statik render edilemez.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Kurum yoksa (bilinmeyen subdomain, K8 — 22 Eylul 2026) getCurrentTenant
  // notFound() atar → govdesiz notr 404. Eskiden default kurumun dosyasi
  // servis ediliyordu (apex adresleriyle).
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

  const [newsRes, announcementsRes, pagesRes, albumsRes, branchesRes, membersRes] = await Promise.all([
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
    supabase
      .from("branches")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true),
    supabase
      .from("board_members")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .eq("is_active", true),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/haberler`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/duyurular`, changeFrequency: "daily", priority: 0.9 },
    // Yonetim kurulu listesi yalniz aktif uye varsa: bos liste noindex
    // (kurumsal/yonetim-kurulu/page.tsx) — sitemap'te olmasi celiskili sinyal.
    ...((membersRes.data || []).length > 0
      ? [{ url: `${baseUrl}/kurumsal/yonetim-kurulu`, changeFrequency: "monthly" as const, priority: 0.7 }]
      : []),
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

  // Her sayfa TEK adreste: /sayfa/<slug> (23 Eylul 2026). Eski
  // /kurumsal/<slug> adresleri 308 ile buraya tasinir; sitemap'te yer almaz.
  const dynamicPages: MetadataRoute.Sitemap = (pagesRes.data || [])
    .map((item) => ({
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

  // slug null olabilir (eski kayitlar) — detay sayfasi slug ister, filtrele.
  // manset/[id], bolum/[id], subeler/[slug]/yonetici BILEREK yok: efemer/ince
  // icerik, indekslenecek deger tasimiyor (b6 Asama 1 karari).
  const branchPages: MetadataRoute.Sitemap = (branchesRes.data || [])
    .filter((item) => item.slug)
    .map((item) => ({
      url: `${baseUrl}/subeler/${item.slug}`,
      changeFrequency: "monthly",
      priority: 0.5,
    }));

  const memberPages: MetadataRoute.Sitemap = (membersRes.data || [])
    .filter((item) => item.slug)
    .map((item) => ({
      url: `${baseUrl}/yonetim-kurulu/${item.slug}`,
      changeFrequency: "monthly",
      priority: 0.4,
    }));

  return [
    ...staticPages,
    ...newsPages,
    ...announcementPages,
    ...dynamicPages,
    ...albumPages,
    ...branchPages,
    ...memberPages,
  ];
}
