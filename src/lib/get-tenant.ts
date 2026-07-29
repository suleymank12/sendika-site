import { cache } from "react";
import { headers } from "next/headers";
import { getTenant } from "./tenant";
import type { Tenant } from "./tenant";

// Server Component'lerde kullan: const tenant = await getCurrentTenant();
//
// React cache() = ISTEK-ICI memoizasyon. Ayni HTTP isteginde
// generateMetadata + layout + page toplam 3-4 kez cagiriyor; sarmalamadan
// once her cagri ayri bir `tenants` sorgusuydu. Istekler arasi cache
// DEGILDIR (unstable_cache bilincli yok — tenant sizintisi riski, ayri is).
export const getCurrentTenant = cache(async (): Promise<Tenant> => {
  const headersList = headers();
  const slug = headersList.get("x-tenant-slug") || "default";

  const tenant = await getTenant(slug);

  if (!tenant) {
    // Tenant bulunamadıysa default'a düş
    const defaultTenant = await getTenant("default");
    if (!defaultTenant) {
      throw new Error("Default tenant bulunamadı!");
    }
    return defaultTenant;
  }

  return tenant;
});
