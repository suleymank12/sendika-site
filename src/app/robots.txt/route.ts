/**
 * /robots.txt — ROUTE HANDLER (Supabase kesinti dayanikliligi C7, 24 Eylul 2026).
 *
 * Eskiden `app/robots.ts` metadata route'u idi. Metadata route bir hata
 * durum kodu SECEMIYOR: veri hatasi yutulup eksik dosya 200 donuyor ya da
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
import { geciciHata503, geciciHataMi } from "@/lib/veri-hatasi";
import { getCurrentTenant } from "@/lib/get-tenant";
import { buildTenantPublicUrl } from "@/lib/tenant-url";

// Tenant header'ina (x-tenant-slug) bagli oldugu icin statik render edilemez.
export const dynamic = "force-dynamic";

async function robotsVerisi(): Promise<MetadataRoute.Robots> {
  // Kurum yoksa (bilinmeyen subdomain, K8 — 22 Eylul 2026) getCurrentTenant
  // notFound() atar → govdesiz notr 404. Eskiden default kurumun dosyasi
  // servis ediliyordu (apex adresleriyle).
  const tenant = await getCurrentTenant();

  // Pasif tenant: tum site noindex (arama motorlari hicbir seyi indekslemesin).
  if (!tenant.is_active) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  const baseUrl = buildTenantPublicUrl(tenant);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Prefix eslesmesi: "/admin" hem /admin'in kendisini hem /admin/*'i
      // kapsar (eski "/admin/" slash'li hali /admin URL'sini kapsamiyordu).
      disallow: ["/admin", "/super-admin", "/api"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}

export async function GET(): Promise<Response> {
  try {
    const content = resolveRouteData(await robotsVerisi(), "robots");
    return new Response(content, {
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "public, max-age=0, must-revalidate",
      },
    });
  } catch (hata) {
    if (geciciHataMi(hata)) {
      console.error("[robots.txt] gecici hata → 503:", hata);
      return geciciHata503();
    }
    throw hata;
  }
}
