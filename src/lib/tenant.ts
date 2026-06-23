import { createClient } from "@/lib/supabase/server";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  logo_url: string | null;
  favicon_url: string | null;
  is_active: boolean;
  enabled_modules: Record<string, boolean>;
}

// hostname'den tenant slug'ını çıkar
export function extractSlug(hostname: string): string {
  // localhost:3000 → "default"
  // sendika-a.localhost:3000 → "sendika-a"
  // sendika-a.platform.com → "sendika-a"
  // www.platform.com → "default"
  // platform.com → "default"

  const host = hostname.split(":")[0]; // portu kaldır

  // localhost ise
  if (host === "localhost" || host === "127.0.0.1") {
    return "default";
  }

  // sub.localhost gibi local subdomain destekle
  if (host.endsWith(".localhost")) {
    const sub = host.replace(/\.localhost$/, "");
    if (!sub || sub === "www") return "default";
    return sub;
  }

  // .vercel.app domain'i için
  // sendika-site.vercel.app → "default" (ana domain)
  // sendika-a.sendika-site.vercel.app → "sendika-a"
  if (host.endsWith(".vercel.app")) {
    const parts = host.replace(".vercel.app", "").split(".");
    if (parts.length <= 1) return "default"; // ana domain
    return parts[0]; // ilk subdomain
  }

  // Genel subdomain çıkarma
  const parts = host.split(".");
  if (parts.length <= 2) return "default"; // example.com → default
  const first = parts[0];
  if (first === "www") return "default";
  return first; // sub.example.com → "sub"
}

// slug'dan tenant bilgisini getir
export async function getTenant(slug: string): Promise<Tenant | null> {
  const supabase = createClient();

  const { data } = await supabase
    .from("tenants")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  return data as Tenant | null;
}

// hostname'den direkt tenant getir
export async function getTenantFromHostname(hostname: string): Promise<Tenant | null> {
  const slug = extractSlug(hostname);

  // Önce slug ile dene
  let tenant = await getTenant(slug);

  // Bulunamadıysa custom_domain ile dene
  if (!tenant && slug === "default") {
    const host = hostname.split(":")[0];
    const supabase = createClient();
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .eq("custom_domain", host)
      .maybeSingle();
    tenant = data as Tenant | null;
  }

  return tenant;
}
