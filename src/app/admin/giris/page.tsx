import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import AdminLoginForm from "./AdminLoginForm";

export default async function AdminLoginPage() {
  const tenant = await getCurrentTenant();

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
