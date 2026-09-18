import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantOrNull } from "@/lib/get-tenant";
import AdminShell from "@/components/admin/AdminShell";
import AdminTenantPasifView from "../_components/AdminTenantPasifView";
import AdminTenantBulunamadiView from "../_components/AdminTenantBulunamadiView";

export default async function AuthenticatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // 1) Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error("[AdminLayout] Auth check failed:", authError);
    redirect("/admin/giris");
  }
  if (!user) {
    redirect("/admin/giris");
  }

  // 2) Tenant
  // FAIL-CLOSED — IKINCI KATMAN (b3).
  //
  // Asil kapi artik UST layout'ta (`app/admin/layout.tsx`): tenant
  // cozulemezse bu layout hic calismaz. Burasi savunma derinligi olarak
  // duruyor ve `getCurrentTenantOrNull()` null donebildigi icin tip
  // olarak da gerekli.
  //
  // Yonlendirme DEGIL render: ust layout ile ayni desen, sonsuz yonlendirme
  // riski yok (gerekce: `app/admin/layout.tsx` basindaki dongu analizi).
  const tenant = await getCurrentTenantOrNull();
  if (!tenant) {
    console.error("[AdminLayout] Tenant resolve edilemedi — x-tenant-slug karsiligi yok");
    return <AdminTenantBulunamadiView />;
  }

  // 2.5) Pasif tenant: her durumda kapali (super admin de gormez,
  // reaktivasyon super-admin panelinden yapilir)
  if (!tenant.is_active) {
    return <AdminTenantPasifView />;
  }

  // 3) Süper admin bypass
  const { data: isSuperAdmin, error: rpcError } = await supabase.rpc(
    "is_super_admin",
    { user_id: user.id }
  );
  if (rpcError) {
    console.error("[AdminLayout] is_super_admin RPC hatası:", rpcError);
    // Güvenli taraf: normal üyelik kontrolüne düş
  }
  if (isSuperAdmin) {
    return <AdminShell initialTenant={tenant}>{children}</AdminShell>;
  }

  // 4) Tenant üyelik kontrolü
  const { data: membership, error: memberError } = await supabase
    .from("tenant_users")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  if (memberError) {
    console.error("[AdminLayout] Membership check failed:", memberError);
    redirect("/admin/yetkisiz");
  }
  if (!membership) {
    redirect("/admin/yetkisiz");
  }

  // initialTenant: istemci tenant'i hostname'den TEKRAR cozmesin. Custom
  // domain'de istemci custom_domain'i cozemedigi icin default'a dusuyor,
  // panel BASKA TENANT'IN verisini gosteriyordu (8 Eylul 2026 bug'i).
  return <AdminShell initialTenant={tenant}>{children}</AdminShell>;
}
