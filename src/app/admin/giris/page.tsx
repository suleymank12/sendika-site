import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantOrNull } from "@/lib/get-tenant";
import AdminLoginForm from "./AdminLoginForm";

export default async function AdminLoginPage() {
  // 🔴 SAYFA SEVIYESI FAIL-CLOSED (19 Eylul 2026) — `app/admin/layout.tsx`
  // zaten kapiyi tutuyor ama BU YETMIYOR: Next layout ile sayfayi PARALEL
  // calistiriyor (b2'de olculdu). Layout `children`'i atsa bile bu fonksiyon
  // yine kosar, default tenant'a duser, DB'ye gider ve sonucu RSC Flight
  // yukune SERIALIZE EDER — olmayan bir subdomain'in HTML kaynaginda
  // `initialTitle:"Sendika Adi"` gorunuyordu.
  //
  // Kural: tenant VERISI OKUYAN her admin sayfasi `getCurrentTenantOrNull`
  // kullanip null'da cikmali. Gorsel kapi layout'ta, veri kapisi burada.
  const tenant = await getCurrentTenantOrNull();
  if (!tenant) return null; // layout hata ekranini gosteriyor

  // site_title çek (RootLayout pattern'i)
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", "site_title")
    .maybeSingle();

  // Pasif tenant'ta tenant kimligini sizdirma: notr baslik goster.
  // Login acik kalir (super admin buradan /super-admin'e ulasabilir).
  const title = tenant.is_active
    ? settings?.value || tenant.name || "Sendika Adı"
    : "Yönetim Paneli";

  return (
    <Suspense fallback={<LoginFallback />}>
      <AdminLoginForm initialTitle={title} />
    </Suspense>
  );
}

function LoginFallback() {
  return <div className="min-h-screen bg-bg-light" />;
}
