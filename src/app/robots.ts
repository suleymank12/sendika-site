import { MetadataRoute } from "next";
import { getCurrentTenant } from "@/lib/get-tenant";
import { buildTenantPublicUrl } from "@/lib/tenant-url";

// Tenant header'ina (x-tenant-slug) bagli oldugu icin statik render edilemez.
export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
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
