import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import AdminShell from "@/components/admin/AdminShell";
import AdminTenantPasifView from "../_components/AdminTenantPasifView";

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
  const tenant = await getCurrentTenant();
  if (!tenant) {
    console.error("[AdminLayout] Tenant resolve edilemedi");
    redirect("/admin/giris");
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
    return <AdminShell>{children}</AdminShell>;
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

  return <AdminShell>{children}</AdminShell>;
}
