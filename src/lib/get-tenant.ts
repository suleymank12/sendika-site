import { headers } from "next/headers";
import { getTenant } from "./tenant";
import type { Tenant } from "./tenant";

// Server Component'lerde kullan: const tenant = await getCurrentTenant();
export async function getCurrentTenant(): Promise<Tenant> {
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
}
