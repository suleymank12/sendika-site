import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sanitizeAuthCookies } from "./cookie-sanitize";
import { zamanAsimliFetch } from "./zaman-asimli-fetch";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // C3: admin/super admin layout'lari ve API okumalari — 6 sn (zaman-asimli-fetch).
      global: { fetch: zamanAsimliFetch("admin-okuma") },
      cookies: {
        getAll() {
          // 🔴 Çözümlenemeyen auth çerezi istemciye HİÇ verilmez (20 Eylül
          // 2026). Middleware'deki süzgecin aynısı — ama bu dosya `/api`
          // route'larında da kullanılıyor ve MIDDLEWARE ORAYA HİÇ UĞRAMIYOR
          // (matcher `/api`'yi dışlıyor). Süzgeç iki yerde birden gerekli.
          // Gerekçe ve ölçümler: lib/supabase/cookie-sanitize.
          return sanitizeAuthCookies(cookieStore.getAll()).kept;
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing sessions.
          }
        },
      },
    }
  );
}
