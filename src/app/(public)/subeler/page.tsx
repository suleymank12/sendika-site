import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import Breadcrumb from "@/components/public/Breadcrumb";
import BranchCard from "@/components/public/BranchCard";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Şubelerimiz",
  description: "Sendika şubeleri ve iletişim bilgileri",
};

export default async function BranchesPage() {
  // createAdminClient (RLS bypass) kasıtlı: tenant izolasyonu ve aktiflik
  // manuel .eq("tenant_id") / .eq("is_active", true) filtreleriyle sağlanıyor.
  const supabase = createAdminClient();
  const tenant = await getCurrentTenant();
  const { data: branches } = await supabase
    .from("branches")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("is_active", true)
    .order("order", { ascending: true });

  return (
    <>
      <Breadcrumb items={[{ label: "Şubelerimiz" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Şubelerimiz</h1>
        {(branches || []).length === 0 ? (
          <p className="text-text-muted">Henüz şube bilgisi eklenmemiş.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(branches || []).map((branch) => (
              <BranchCard key={branch.id} branch={branch} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
