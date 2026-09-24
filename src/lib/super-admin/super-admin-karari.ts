import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { isTransportAuthError } from "@/lib/supabase/cookie-sanitize";
import { decideSuperAdminAccess } from "@/lib/admin-access";

/**
 * SUPER ADMIN SUNUCU SAYFALARININ YETKI KAPISI (Guvenlik G1 / S1, 25 Eylul 2026).
 *
 * NEDEN: Next 14 layout ile sayfayi PARALEL render eder. Yetki yalniz
 * layout'ta cozuldugunde sayfanin sunucu bileseni yine calisiyordu; yetkisiz
 * (rpc false) ve gecici hata (rpc hatasi) ekranlarinda pano ciktisi — kurum
 * adlari, slug, id, sayilar — RSC yukune giriyordu (olculdu:
 * raporlar/2026-09-25-0126-…, S1). T10 dersiyle ayni sinif: "layout'taki
 * kapi sayfayi korumaz".
 *
 * KURAL: `super-admin/(authenticated)` altindaki her SUNUCU sayfasinin ilk
 * iki ifadesi:
 *
 *   const karar = await superAdminKarari();
 *   if (karar.kind !== "izin") return null;
 *
 * Mühür: `npm run test:super-admin-sayfa`.
 *
 * React `cache()` = ISTEK ICI tek hesap: layout ve sayfa ayni sozu bekler,
 * getUser + rpc istek basina BIR kez gider (olculur: test:kesinti s1, rpc 1).
 * Istekler arasi onbellek DEGILDIR.
 *
 * Karar `decideSuperAdminAccess` (saf, test:admin-access) ile — API
 * uclarindaki `requireSuperAdmin` ile ayni siniflar: gecici hata (tasima ya da
 * rpc hatasi) yetkisizlik DEGIL.
 */
export type SuperAdminKarari =
  | { kind: "izin"; user: User }
  | { kind: "giris" | "yetkisiz" | "gecici-hata"; user: User | null };

export const superAdminKarari = cache(async (): Promise<SuperAdminKarari> => {
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
  if (karar.kind === "gecici-hata") {
    // C8 ile ayni: Supabase'e ulasilamadi → gecici sorun (giris DEGIL, panel KAPALI).
    console.error("[SuperAdmin] yetki dogrulanamadi (gecici):", authError ?? rpcError);
  }
  if (karar.kind === "izin" && user) return { kind: "izin", user };
  return { kind: karar.kind === "izin" ? "yetkisiz" : karar.kind, user };
});
