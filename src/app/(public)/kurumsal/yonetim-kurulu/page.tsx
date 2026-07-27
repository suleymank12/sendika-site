import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import Breadcrumb from "@/components/public/Breadcrumb";
import BoardMemberCard from "@/components/public/BoardMemberCard";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Yönetim Kurulu",
  description: "Yönetim kurulu üyeleri",
};

export default async function BoardMembersPage() {
  // createAdminClient (RLS bypass) kasıtlı: tenant izolasyonu ve aktiflik
  // manuel .eq("tenant_id") / .eq("is_active", true) filtreleriyle sağlanıyor.
  const supabase = createAdminClient();
  const tenant = await getCurrentTenant();
  const { data: members } = await supabase
    .from("board_members")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("order", { ascending: true });

  return (
    <>
      <Breadcrumb items={[{ label: "Kurumsal", href: "#" }, { label: "Yönetim Kurulu" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Yönetim Kurulu</h1>
        {(members || []).length === 0 ? (
          <p className="text-text-muted">Henüz yönetim kurulu üyesi eklenmemiş.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {(members || []).map((member) => (
              <BoardMemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
