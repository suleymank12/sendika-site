import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import Breadcrumb from "@/components/public/Breadcrumb";
import SafeHtml from "@/components/SafeHtml";

import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";

export async function generateMetadata(): Promise<Metadata> {
  return buildPublicMetadata({
    path: "/kurumsal/misyon-vizyon",
    title: "Misyon ve Vizyon",
    description: "Sendikamızın misyon ve vizyonu",
  });
}

export default async function MisyonVizyonPage() {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("slug", "misyon-vizyon")
    .eq("is_published", true)
    .single();

  return (
    <>
      <Breadcrumb items={[{ label: "Kurumsal", href: "#" }, { label: "Misyon & Vizyon" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Misyon & Vizyon</h1>
        {page?.content ? (
          <SafeHtml html={page.content} className="prose max-w-none text-lg text-text-dark" />
        ) : (
          <p className="text-text-muted">Bu sayfa henüz oluşturulmamış. Admin panelden içerik ekleyebilirsiniz.</p>
        )}
      </div>
    </>
  );
}
