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
