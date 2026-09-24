import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getBranchBySlug } from "@/lib/public-queries";
import { hataVarsaFirlat } from "@/lib/veri-hatasi";
import { notFound, redirect } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import Breadcrumb from "@/components/public/Breadcrumb";
import SafeHtml from "@/components/SafeHtml";
import { User, Phone, Mail } from "lucide-react";
import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

// createAdminClient (RLS bypass) kasıtlı: tenant izolasyonu ve aktiflik
// manuel .eq("tenant_id") / .eq("is_active", true) filtreleriyle sağlanıyor.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  // cache()'li ortak okuyucu — sayfa ile AYNI sorguyu paylaşır (b2).
  // Aynı okuyucu `subeler/[slug]` tarafından da kullanılıyor.
  const data = await getBranchBySlug(tenant.id, params.slug);

  if (!data || !data.manager_name) return { title: "Yönetici Bulunamadı" };

  return buildPublicMetadata({
    path: `/subeler/${params.slug}/yonetici`,
    title: `${data.manager_name} — ${data.name}`,
    description: data.manager_title || undefined,
  });
}

export default async function BranchManagerPage({ params }: Props) {
  const supabase = createAdminClient();
  const tenant = await getCurrentTenant();

  // Bu sayfa BİLEREK seri kaldı (b2): ikinci sorgu `branch.manager_id`
  // varsa açılıyor ve sonucuna göre redirect ediyor — gerçek bağımlılık.
  const branchData = await getBranchBySlug(tenant.id, params.slug);

  if (!branchData) notFound();

  const branch = branchData;

  // Yönetim kurulundan seçilmişse o sayfaya yönlendir
  if (branch.manager_id) {
    // .single() → .maybeSingle() (C7): 0 satir "hata" (PGRST116) DEGIL, "yok".
    const { data: bm, error } = await supabase
      .from("board_members")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .eq("id", branch.manager_id)
      .eq("is_active", true)
      .maybeSingle();
    hataVarsaFirlat(error, "sube yoneticisi yonlendirmesi"); // BIRINCIL
    if (bm?.slug) {
      redirect(`/yonetim-kurulu/${bm.slug}`);
    }
  }

  // Manuel yönetici yoksa 404
  if (!branch.manager_name) notFound();

  return (
    <div className="bg-gray-50 flex-1">
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
              <SafeImage
                src={branch.manager_photo}
                alt={branch.manager_name}
                fill
                sizes="(max-width: 768px) 100vw, 320px"
                className="object-cover"
                fallback={
                  <div className="h-full w-full flex items-center justify-center min-h-[320px]">
                    <User className="h-20 w-20 text-text-muted/20" />
                  </div>
                }
              />
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
            <SafeHtml html={branch.manager_bio} className="prose max-w-none text-text-dark" />
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
