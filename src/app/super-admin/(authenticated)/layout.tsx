import { redirect } from "next/navigation";
import { SUPER_ADMIN_LOGIN_PATH } from "@/lib/constants";
import SuperAdminShell from "@/components/super-admin/SuperAdminShell";
import SuperAdminYetkisizView from "../_components/SuperAdminYetkisizView";
import SuperAdminGeciciHataView from "../_components/SuperAdminGeciciHataView";
import { superAdminKarari } from "@/lib/super-admin/super-admin-karari";
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
  // G1 (25 Eylul 2026): karar PAYLASILAN kapidan — istek ici tek hesap
  // (React cache); sunucu sayfalari da ayni kapiyi bekler ve yetkisizde hic
  // okumaz (lib/super-admin/super-admin-karari, muhur test:super-admin-sayfa).
  const karar = await superAdminKarari();

  // C8: Supabase'e ulasilamadi (oturum ya da is_super_admin rpc'si) → gecici
  // sorun (giris DEGIL, panel KAPALI). rpc HATASI "yetkiniz yok" DEGIL —
  // eskiden hata yutulup Yetkisiz ekrani cikiyordu (kesintide yanlis teshis).
  if (karar.kind === "gecici-hata") {
    return <SuperAdminGeciciHataView />;
  }

  // Oturum yok → giriş. Middleware bunu zaten yapıyor; burası savunma
  // derinliği. Hedef /admin/giris DEĞİL: o sayfa tenant'a bağlı ve süper
  // admin host'unda kurum yok.
  if (karar.kind === "giris") {
    redirect(SUPER_ADMIN_LOGIN_PATH);
  }

  // 🔴 YÖNLENDİRME DEĞİL RENDER. Eskiden `/admin/giris`'e atılıyordu; giriş
  // yapmış birini giriş sayfasına atmak (a) süper admin host'unda ölü bir
  // adrese gider, (b) middleware'in "girişli kullanıcıyı panele al"
  // kuralıyla birleşince döngü üretir. Gerekçe: SuperAdminYetkisizView.
  // Gercek yetkisizlik (rpc false) AYNEN Yetkisiz ekrani.
  if (karar.kind !== "izin") {
    return <SuperAdminYetkisizView />;
  }

  return (
    <>
      <SuperAdminShell email={karar.user.email || ""}>{children}</SuperAdminShell>
      <ToastProvider />
    </>
  );
}
