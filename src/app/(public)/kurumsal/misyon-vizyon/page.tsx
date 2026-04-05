import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Misyon ve Vizyon",
  description: "Sendikamızın misyon ve vizyonu",
};

export default async function MisyonVizyonPage() {
  const supabase = createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", "misyon-vizyon")
    .eq("is_published", true)
    .single();

  return (
    <>
      <Breadcrumb items={[{ label: "Kurumsal", href: "#" }, { label: "Misyon & Vizyon" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Misyon & Vizyon</h1>
        {page?.content ? (
          <div className="prose prose-lg max-w-none text-text-dark" dangerouslySetInnerHTML={{ __html: page.content }} />
        ) : (
          <p className="text-text-muted">Bu sayfa henüz oluşturulmamış. Admin panelden içerik ekleyebilirsiniz.</p>
        )}
      </div>
    </>
  );
}
