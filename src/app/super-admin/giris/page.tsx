import { Suspense } from "react";
import SuperAdminLoginForm from "./SuperAdminLoginForm";

/**
 * Platform yönetimi giriş sayfası (19 Eylül 2026).
 *
 * `(authenticated)` route grubunun DIŞINDA — yani auth + `is_super_admin`
 * kapısına takılmaz. `/admin` tarafındaki yapının aynısı.
 *
 * 🔴 TENANT SORGUSU YOK. `/admin/giris` `getCurrentTenantOrNull()` çağırıp
 * kurum başlığını gösteriyor; süper admin host'unda kurum olmadığı için o
 * sayfa orada "Kurum bulunamadı" ekranına düşerdi. Burada kurum hiç
 * sorulmuyor: sayfa her host'ta aynı nötr markayı gösterir.
 */
export const metadata = {
  title: "Platform Yönetimi",
  robots: { index: false, follow: false },
};

export default function SuperAdminLoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50" />}>
      <SuperAdminLoginForm />
    </Suspense>
  );
}
