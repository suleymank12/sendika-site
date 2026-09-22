import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import Breadcrumb from "@/components/public/Breadcrumb";
import BoardMemberCard from "@/components/public/BoardMemberCard";

import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";

// cache(): generateMetadata (noindex karari) ile sayfa ayni istekte AYNI
// sorguyu paylasir — DB'ye tek sorgu.
const aktifUyeler = cache(async (tenantId: string) => {
  // createAdminClient (RLS bypass) kasıtlı: tenant izolasyonu ve aktiflik
  // manuel .eq("tenant_id") / .eq("is_active", true) filtreleriyle sağlanıyor.
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("board_members")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("order", { ascending: true });
  return data || [];
});

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const members = await aktifUyeler(tenant.id);
  const meta = await buildPublicMetadata({
    path: "/kurumsal/yonetim-kurulu",
    title: "Yönetim Kurulu",
    description: "Yönetim kurulu üyeleri",
  });
  // Uye yoksa sayfa yalniz "henuz eklenmemis" metni — indekslenecek icerik
  // yok (sitemap.ts de bu durumda adresi listelemez).
  return members.length === 0 ? { ...meta, robots: { index: false, follow: true } } : meta;
}

export default async function BoardMembersPage() {
  const tenant = await getCurrentTenant();
  const members = await aktifUyeler(tenant.id);

  return (
    <>
      {/* "Kurumsal" bir grup adi, sayfasi yok: bagsiz etiket (Breadcrumb
          href'siz ogeyi span basar). Eskiden href:"#" → mevcut adres + "#". */}
      <Breadcrumb items={[{ label: "Kurumsal" }, { label: "Yönetim Kurulu" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Yönetim Kurulu</h1>
        {members.length === 0 ? (
          <p className="text-text-muted">Henüz yönetim kurulu üyesi eklenmemiş.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {members.map((member) => (
              <BoardMemberCard key={member.id} member={member} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
