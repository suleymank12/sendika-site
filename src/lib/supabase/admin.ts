import { createClient } from "@supabase/supabase-js";
import { zamanAsimliFetch, type SupabaseKatmani } from "./zaman-asimli-fetch";

/**
 * Service role istemcisi. `katman` ZORUNLU (C3, 24 Eylul 2026) — zaman asimi
 * butcesini cagiran belirler:
 *   "public-okuma" (5 sn)  public sayfalar, sitemap, public-queries
 *   "admin-okuma"  (6 sn)  yalniz okuyan API uclari (GET)
 *   "yazma"       (25 sn)  yazan API uclari — ust sinirda yanit "sonuc
 *                          dogrulanamadi" (lib/yazma-yaniti), "basarisiz" degil
 */
export function createAdminClient(katman: Exclude<SupabaseKatmani, "middleware">) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: { fetch: zamanAsimliFetch(katman) },
    }
  );
}
