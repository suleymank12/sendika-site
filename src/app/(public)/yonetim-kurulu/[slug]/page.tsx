import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Breadcrumb from "@/components/public/Breadcrumb";
import { Users, Phone, Mail } from "lucide-react";
import type { BoardMember } from "@/types";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("board_members")
    .select("name, title, photo")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  if (!data) return { title: "Üye Bulunamadı" };

  return {
    title: data.name,
    description: data.title || undefined,
    openGraph: {
      title: data.name,
      description: data.title || undefined,
      images: data.photo ? [data.photo] : undefined,
    },
  };
}

export default async function BoardMemberDetailPage({ params }: Props) {
  const supabase = createClient();

  const { data: member } = await supabase
    .from("board_members")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!member) notFound();

  const m = member as BoardMember;

  return (
    <div className="bg-gray-50 min-h-screen">
      <Breadcrumb
        items={[
          { label: "Kurumsal", href: "#" },
          { label: "Yönetim Kurulu", href: "/kurumsal/yonetim-kurulu" },
          { label: m.name },
        ]}
      />

      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Header card */}
        <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm mb-6">
          <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-0">
            {/* Photo */}
            <div className="relative aspect-[4/5] md:aspect-auto bg-bg-light">
              {m.photo ? (
                <Image
                  src={m.photo}
                  alt={m.name}
                  fill
                  sizes="(max-width: 768px) 100vw, 320px"
                  className="object-cover"
                />
              ) : (
                <div className="h-full w-full flex items-center justify-center min-h-[320px]">
                  <Users className="h-20 w-20 text-text-muted/20" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="p-6 lg:p-8 flex flex-col">
              <h1 className="text-2xl lg:text-3xl font-bold text-text-dark tracking-tight">
                {m.name}
              </h1>
              {m.title && (
                <p className="text-base lg:text-lg text-primary-light font-medium mt-1">
                  {m.title}
                </p>
              )}

              {(m.phone || m.email) && (
                <div className="border-t border-border mt-5 pt-5 space-y-3">
                  {m.phone && (
                    <a
                      href={`tel:${m.phone}`}
                      className="flex items-center gap-3 text-sm text-text-dark hover:text-primary transition-colors"
                    >
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Phone className="h-4 w-4 text-primary" />
                      </div>
                      {m.phone}
                    </a>
                  )}
                  {m.email && (
                    <a
                      href={`mailto:${m.email}`}
                      className="flex items-center gap-3 text-sm text-text-dark hover:text-primary transition-colors"
                    >
                      <div className="rounded-lg bg-primary/10 p-2">
                        <Mail className="h-4 w-4 text-primary" />
                      </div>
                      {m.email}
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bio */}
        {m.bio && (
          <div className="bg-white border border-border rounded-xl p-6 lg:p-8 shadow-sm mb-6">
            <h2 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-4">
              Hakkında
            </h2>
            <div
              className="prose max-w-none text-text-dark"
              dangerouslySetInnerHTML={{ __html: m.bio }}
            />
          </div>
        )}

        {!m.bio && (
          <div className="bg-white border border-border rounded-xl p-6 text-center text-text-muted text-sm shadow-sm">
            Bu üye için henüz ayrıntılı bilgi eklenmemiş.
          </div>
        )}
      </div>
    </div>
  );
}
