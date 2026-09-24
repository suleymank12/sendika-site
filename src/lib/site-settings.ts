import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { hataVarsaFirlat } from "@/lib/veri-hatasi";

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
    const { data, error } = await supabase
      .from("site_settings")
      .select("key, value")
      .eq("tenant_id", tenantId);
    // BIRINCIL (C7): ayar okunamadiysa varsayilanla (markasiz, menusuz) 200
    // render ETMEK YOK — firlat, notr hata sayfasi. Kok metadata bu hatayi
    // bilincli olarak yakalar (admin'i de sardigi icin; app/layout.tsx).
    hataVarsaFirlat(error, "site ayarlari");

    const settings: Record<string, string> = {};
    data?.forEach((item: { key: string; value: string | null }) => {
      settings[item.key] = item.value || "";
    });
    return settings;
  }
);
