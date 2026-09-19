import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { sanitizeAuthCookies } from "./cookie-sanitize";

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
