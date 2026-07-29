import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * Tenant'in TUM site_settings satirlarini key -> value map'i olarak doner
 * (null value'lar "" olur — cagiran taraflar `||` fallback'iyle calisiyor).
 *
 * React cache() = ISTEK-ICI memoizasyon: ayni HTTP isteginde root layout
 * generateMetadata + (public) layout + sayfa kac kez cagirirsa cagirsin
 * DB'ye TEK sorgu gider. Istekler arasi cache DEGILDIR — unstable_cache
 * bilincli kullanilmiyor (tenant sizintisi riski tasiyan ayri is, Tur 2
 * teshis madde 6).
 */
export const getSiteSettings = cache(
  async (tenantId: string): Promise<Record<string, string>> => {
    const supabase = createClient();
    const { data } = await supabase
      .from("site_settings")
      .select("key, value")
      .eq("tenant_id", tenantId);

    const settings: Record<string, string> = {};
    data?.forEach((item: { key: string; value: string | null }) => {
      settings[item.key] = item.value || "";
    });
    return settings;
  }
);
