import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isTransportAuthError } from "@/lib/supabase/cookie-sanitize";
import { decideSuperAdminAccess } from "@/lib/admin-access";

/**
 * SUPER ADMIN API YETKI KAPISI — tek kaynak (C8, 24 Eylul 2026).
 *
 * Eskiden her route kendi kopyasini tasiyordu (7 yer) ve `is_super_admin`
 * rpc HATASINI "yetkiniz yok" (403) sayiyordu: Supabase kesintisinde panel
 * "yetkiniz yok" diyordu. Karar artik saf fonksiyonda
 * (lib/admin-access decideSuperAdminAccess):
 *
 *   oturum yok / 4xx            → 401 (degismedi)
 *   rpc basariyla false         → 403 (gercek yetkisizlik, degismedi)
 *   oturum TASIMA hatasi / rpc HATASI → 503 + Retry-After: 30 (FAIL-CLOSED:
 *                                  islem YAPILMAZ, yalniz dogru sebep soylenir)
 *
 * 🔴 Host kapisi (requireSuperAdminHost) handler'da BUNDAN ONCE cagrilir
 * (test:super-admin-host muhurlu).
 */
export async function requireSuperAdmin(): Promise<{ user: User } | { error: NextResponse }> {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  let isSuperAdmin: unknown = null;
  let rpcError: { message?: string } | null = null;
  if (user && !authError) {
    const rpc = await supabase.rpc("is_super_admin", { user_id: user.id });
    isSuperAdmin = rpc.data;
    rpcError = rpc.error;
  }

  const karar = decideSuperAdminAccess({ user, authError, isSuperAdmin, rpcError }, isTransportAuthError);
  switch (karar.kind) {
    case "izin":
      return { user: user as User };
    case "giris":
      return { error: NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 }) };
    case "yetkisiz":
      return { error: NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }) };
    case "gecici-hata":
      console.error("[requireSuperAdmin] yetki dogrulanamadi (gecici):", authError ?? rpcError);
      return {
        error: NextResponse.json(
          { error: "Yetki şu anda doğrulanamadı. Lütfen biraz sonra tekrar deneyin." },
          { status: 503, headers: { "retry-after": "30", "cache-control": "no-store" } }
        ),
      };
  }
}
