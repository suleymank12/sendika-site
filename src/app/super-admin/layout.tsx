import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SuperAdminShell from "@/components/super-admin/SuperAdminShell";
import ToastProvider from "@/components/ui/Toast";

export const metadata = {
  title: "Platform Yönetimi",
};

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/giris");
  }

  // is_super_admin RPC fonksiyonu ile kontrol
  const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", {
    user_id: user.id,
  });

  if (!isSuperAdmin) {
    redirect("/admin/giris");
  }

  return (
    <>
      <SuperAdminShell email={user.email || ""}>{children}</SuperAdminShell>
      <ToastProvider />
    </>
  );
}
