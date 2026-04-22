import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import Breadcrumb from "@/components/public/Breadcrumb";
import { User, Phone, Mail } from "lucide-react";
import type { Branch } from "@/types";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("branches")
    .select("name, manager_name, manager_title")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  if (!data || !data.manager_name) return { title: "Yönetici Bulunamadı" };

  return {
    title: `${data.manager_name} — ${data.name}`,
    description: data.manager_title || undefined,
  };
}

export default async function BranchManagerPage({ params }: Props) {
  const supabase = createClient();

  const { data: branchData } = await supabase
    .from("branches")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  if (!branchData) notFound();

  const branch = branchData as Branch;

  // Yönetim kurulundan seçilmişse o sayfaya yönlendir
  if (branch.manager_id) {
    const { data: bm } = await supabase
      .from("board_members")
      .select("slug")
      .eq("id", branch.manager_id)
      .single();
    if (bm?.slug) {
      redirect(`/yonetim-kurulu/${bm.slug}`);
    }
  }

  // Manuel yönetici yoksa 404
  if (!branch.manager_name) notFound();

  return (
    <div className="bg-gray-50 min-h-screen">
      <Breadcrumb
        items={[
          { label: "Şubelerimiz", href: "/subeler" },
          { label: branch.name, href: `/subeler/${branch.slug}` },
          { label: branch.manager_name },
        ]}
      />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header card */}
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0">
            <div className="relative aspect-[4/5] md:aspect-auto bg-bg-light">
              {branch.manager_photo ? (
                <Image
                  src={branch.manager_photo}
                  alt={branch.manager_name}
                  fill
                  sizes="(max-width: 768px) 100vw, 320px"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center min-h-[320px]">
                  <User className="h-20 w-20 text-text-muted/20" />
                </div>
              )}
            </div>

            <div className="p-6 lg:p-8 flex flex-col">
              <h1 className="text-2xl lg:text-3xl font-bold text-text-dark tracking-tight">
                {branch.manager_name}
              </h1>
              {branch.manager_title && (
                <p className="text-base lg:text-lg text-primary-light font-medium mt-1">
                  {branch.manager_title}
                </p>
              )}
              <p className="text-sm text-text-muted mt-1">{branch.name}</p>

              {(branch.manager_phone || branch.manager_email) && (
                <div className="border-t border-border mt-5 pt-5 space-y-3">
                  {branch.manager_phone && (
                    <a
                      href={`tel:${branch.manager_phone}`}
                      className="flex items-center gap-3 text-sm text-text-dark hover:text-primary transition-colors"
                    >
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      {branch.manager_phone}
                    </a>
                  )}
                  {branch.manager_email && (
                    <a
                      href={`mailto:${branch.manager_email}`}
                      className="flex items-center gap-3 text-sm text-text-dark hover:text-primary transition-colors"
                    >
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      {branch.manager_email}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {branch.manager_bio ? (
          <div className="bg-white border border-border rounded-xl p-6 lg:p-8 shadow-sm">
            <h2 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-4">
              Hakkında
            </h2>
            <div
              className="prose max-w-none text-text-dark"
              dangerouslySetInnerHTML={{ __html: branch.manager_bio }}
            />
          </div>
        ) : (
          <div className="bg-white border border-border rounded-xl p-6 text-center text-text-muted text-sm shadow-sm">
            Bu yönetici için henüz ayrıntılı bilgi eklenmemiş.
          </div>
        )}
      </div>
    </div>
  );
}
