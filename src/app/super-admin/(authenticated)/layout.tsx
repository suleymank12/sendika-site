import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SUPER_ADMIN_LOGIN_PATH } from "@/lib/constants";
import SuperAdminShell from "@/components/super-admin/SuperAdminShell";
import SuperAdminYetkisizView from "../_components/SuperAdminYetkisizView";
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
  } = await supabase.auth.getUser();

  // Oturum yok → giriş. Middleware bunu zaten yapıyor; burası savunma
  // derinliği. Hedef /admin/giris DEĞİL: o sayfa tenant'a bağlı ve süper
  // admin host'unda kurum yok.
  if (!user) {
    redirect(SUPER_ADMIN_LOGIN_PATH);
  }

  // is_super_admin RPC fonksiyonu ile kontrol
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });

  // 🔴 YÖNLENDİRME DEĞİL RENDER. Eskiden `/admin/giris`'e atılıyordu; giriş
  // yapmış birini giriş sayfasına atmak (a) süper admin host'unda ölü bir
  // adrese gider, (b) middleware'in "girişli kullanıcıyı panele al"
  // kuralıyla birleşince döngü üretir. Gerekçe: SuperAdminYetkisizView.
  if (!isSuperAdmin) {
    return <SuperAdminYetkisizView />;
  }

  return (
    <>
      <SuperAdminShell email={user.email || ""}>{children}</SuperAdminShell>
      <ToastProvider />
    </>
  );
}
