import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_LOGIN_PATH } from "@/lib/constants";
import SuperAdminShell from "@/components/super-admin/SuperAdminShell";
import SuperAdminYetkisizView from "../_components/SuperAdminYetkisizView";
import SuperAdminGeciciHataView from "../_components/SuperAdminGeciciHataView";
import { decideOturum, decideSuperAdminAccess } from "@/lib/admin-access";
import { isTransportAuthError } from "@/lib/supabase/cookie-sanitize";
import ToastProvider from "@/components/ui/Toast";

export const metadata = {
  title: "Platform Yönetimi",
};

/**
 * Süper admin panelinin auth kapısı.
 *
 * `(authenticated)` route grubu (19 Eylül 2026): `/super-admin/giris` bu
 * grubun DIŞINDA kaldığı için kapıya takılmaz. URL'ler değişmedi —
 * route grupları adrese yansımaz.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // C8: Supabase'e ulasilamadi → gecici sorun (giris DEGIL, panel KAPALI).
  if (decideOturum({ user, authError }, isTransportAuthError) === "gecici-hata") {
    console.error("[SuperAdminLayout] Auth dogrulanamadi (tasima, gecici):", authError);
    return <SuperAdminGeciciHataView />;
  }

  // Oturum yok → giriş. Middleware bunu zaten yapıyor; burası savunma
  // derinliği. Hedef /admin/giris DEĞİL: o sayfa tenant'a bağlı ve süper
  // admin host'unda kurum yok.
  if (!user) {
    redirect(SUPER_ADMIN_LOGIN_PATH);
  }

  // is_super_admin RPC fonksiyonu ile kontrol
  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });

  // C8 (24 Eylul 2026): rpc HATASI "yetkiniz yok" DEGIL — eskiden hata
  // yutulup Yetkisiz ekrani cikiyordu (Supabase kesintisinde yanlis teshis).
  // Gercek yetkisizlik (rpc false) asagida AYNEN Yetkisiz ekrani.
  const karar = decideSuperAdminAccess({ user, authError, isSuperAdmin, rpcError }, isTransportAuthError);
  if (karar.kind === "gecici-hata") {
    console.error("[SuperAdminLayout] is_super_admin dogrulanamadi (gecici):", rpcError);
    return <SuperAdminGeciciHataView />;
  }

  // 🔴 YÖNLENDİRME DEĞİL RENDER. Eskiden `/admin/giris`'e atılıyordu; giriş
  // yapmış birini giriş sayfasına atmak (a) süper admin host'unda ölü bir
  // adrese gider, (b) middleware'in "girişli kullanıcıyı panele al"
  // kuralıyla birleşince döngü üretir. Gerekçe: SuperAdminYetkisizView.
  if (karar.kind !== "izin") {
    return <SuperAdminYetkisizView />;
  }

  return (
    <>
      <SuperAdminShell email={user.email || ""}>{children}</SuperAdminShell>
      <ToastProvider />
    </>
  );
}
