/**
 * /sitemap.xml — ROUTE HANDLER (Supabase kesinti dayanikliligi C7, 24 Eylul 2026).
 *
 * Eskiden `app/sitemap.ts` metadata route'u idi. Metadata route bir hata
 * durum kodu SECEMIYOR: veri hatasi yutulup eksik sitemap 200 donuyor ya da
 * kurum hatasi 404'e dusuyordu (olculdu). Karar: hata → 503 + Retry-After: 30,
 * notr govde (lib/veri-hatasi geciciHata503).
 *
 * Saglikli cikti BIREBIR ayni: Next'in kendi uretecinin (next-metadata-route-
 * loader, dinamik metin rotasi) yaptigini yapiyoruz — ayni `resolveRouteData`,
 * ayni Content-Type, ayni Cache-Control. Bilinmeyen host'ta getCurrentTenant
 * notFound() atar → Next'in govdesiz 404'u (aynen). Izolasyon matrisi bu iki
 * yolu hucre hucre gozluyor.
 */
import { MetadataRoute } from "next";
import { resolveRouteData } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import { geciciHata503, geciciHataMi, hataVarsaFirlat } from "@/lib/veri-hatasi";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import { buildTenantPublicUrl } from "@/lib/tenant-url";

// Tenant header'ina (x-tenant-slug) bagli oldugu icin statik render edilemez.
export const dynamic = "force-dynamic";

async function sitemapVerisi(): Promise<MetadataRoute.Sitemap> {
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
  const supabase = createAdminClient("public-okuma");

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

  // BIRINCIL (C7): eksik sitemap 200 → arama motoru yollari "kayboldu" sanar.
  for (const [yanit, yer] of [
    [newsRes, "sitemap haberler"],
    [announcementsRes, "sitemap duyurular"],
    [pagesRes, "sitemap sayfalar"],
    [albumsRes, "sitemap albumler"],
    [branchesRes, "sitemap subeler"],
    [membersRes, "sitemap yonetim kurulu"],
  ] as const) hataVarsaFirlat(yanit.error, yer);

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

export async function GET(): Promise<Response> {
  try {
    const content = resolveRouteData(await sitemapVerisi(), "sitemap");
    return new Response(content, {
      headers: {
        "Content-Type": "application/xml",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (hata) {
    // Yalniz GECICI hata 503'e cevrilir; notFound() (kurum yok) aynen gecer.
    if (geciciHataMi(hata)) {
      console.error("[sitemap.xml] gecici hata → 503:", hata);
      return geciciHata503();
    }
    throw hata;
  }
}
