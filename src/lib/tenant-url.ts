import { Tenant } from "@/lib/tenant";

/**
 * Tenant'in public site origin URL'ini server-side insa eder.
 *
 * buildTenantAdminUrl (utils.ts) client-only'dir (window kullanir);
 * bu helper server-safe'dir (sitemap.ts / robots.ts gibi route handler'larda
 * kullanilir, window'a bagimli degildir).
 *
 * Oncelik sirasi:
 *   1. custom_domain varsa onu kullan
 *   2. default tenant ise NEXT_PUBLIC_SITE_URL (apex)
 *   3. tenant subdomain ise {slug}.{apex}
 */
export function buildTenantPublicUrl(tenant: Tenant): string {
  // 1. Custom domain (production'da oncelik)
  if (tenant.custom_domain) {
    return `https://${tenant.custom_domain}`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

  // 2. Default tenant: apex'in kendisi
  if (tenant.slug === "default") {
    return siteUrl || "http://lvh.me:3000";
  }

  // 3. Subdomain tenant: {slug}.{apex}
  // env var validation (try-catch yerine): siteUrl yoksa dev fallback
  if (!siteUrl) {
    return `http://${tenant.slug}.lvh.me:3000`;
  }

  const url = new URL(siteUrl);
  return `${url.protocol}//${tenant.slug}.${url.host}`;
}
