import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * PUBLIC OKUMA ISTEMCISI — oturumsuz, cerezsiz (Supabase kesinti
 * dayanikliligi C5, 24 Eylul 2026).
 *
 * Public sorgular kullaniciya gore DEGISMEZ: ziyaretci hep anon rolle okur.
 * Eskiden public sayfalar `lib/supabase/server.ts` (cerezli) istemciyi
 * kullaniyordu; panelde oturumu acik bir yonetici public siteye girince:
 *   - her cerezli istemci suresi gecmis oturumu AYRI AYRI yenilemeye
 *     calisiyordu (auth-js 30 sn'lik yeniden deneme penceresi) — olculdu:
 *     kara delikte public anasayfa 171 sn;
 *   - sorgular "authenticated" rolle gidiyordu (anon ziyaretciden farkli
 *     gorunum riski).
 * Bu istemci cerez OKUMAZ, oturum TUTMAZ, yenileme YAPMAZ.
 *
 * 🔴 Service role gerektiren public okumalar (homepage_sections,
 * board_members, branches, sitemap) `createAdminClient` ile AYNEN kalir;
 * kurum kapsami T10 kurallariyla (test:kurum-cozumu) muhurlu.
 */
export function createPublicClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
}
