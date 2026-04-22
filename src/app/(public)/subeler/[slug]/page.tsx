import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import Breadcrumb from "@/components/public/Breadcrumb";
import { MapPin, Phone, Mail, Clock, User, ChevronRight, ExternalLink } from "lucide-react";
import type { Branch, BoardMember } from "@/types";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("branches")
    .select("name, city, address")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  if (!data) return { title: "Şube Bulunamadı" };

  return {
    title: data.name,
    description: [data.city, data.address].filter(Boolean).join(" — ") || undefined,
  };
}

function buildMapEmbed(branch: Branch): string | null {
  if (branch.map_url) {
    return branch.map_url;
  }
  const query = [branch.name, branch.address, branch.city].filter(Boolean).join(", ");
  if (!query) return null;
  return `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`;
}

function buildMapsLink(branch: Branch): string {
  const query = [branch.name, branch.address, branch.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default async function BranchDetailPage({ params }: Props) {
  const supabase = createClient();

  const { data: branchData } = await supabase
    .from("branches")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .single();

  if (!branchData) notFound();

  const branch = branchData as Branch;

  let boardManager: BoardMember | null = null;
  if (branch.manager_id) {
    const { data } = await supabase
      .from("board_members")
      .select("*")
      .eq("id", branch.manager_id)
      .single();
    boardManager = (data as BoardMember) || null;
  }

  const { data: otherBranchesData } = await supabase
    .from("branches")
    .select("*")
    .eq("is_active", true)
    .neq("id", branch.id)
    .order("order", { ascending: true })
    .limit(4);

  const otherBranches = (otherBranchesData as Branch[]) || [];

  const mapEmbed = buildMapEmbed(branch);
  const mapsLink = buildMapsLink(branch);

  const managerName = boardManager?.name || branch.manager_name || null;
  const managerTitle = boardManager?.title || branch.manager_title || null;
  const managerPhoto = boardManager?.photo || branch.manager_photo || null;
  const managerHref = boardManager?.slug
    ? `/yonetim-kurulu/${boardManager.slug}`
    : branch.manager_name
    ? `/subeler/${branch.slug}/yonetici`
    : null;

  return (
    <div className="bg-gray-50 min-h-screen">
      <Breadcrumb
        items={[
          { label: "Şubelerimiz", href: "/subeler" },
          { label: branch.name },
        ]}
      />

      {/* Hero */}
      <section className="bg-primary text-white">
        <div className="max-w-5xl mx-auto px-4 py-10">
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight">{branch.name}</h1>
          {branch.city && (
            <p className="mt-2 text-primary-light flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4" />
              {branch.city}
            </p>
          )}

          {/* Manager card — hero içinde ama beyaz kart */}
          {managerName && (
            <div className="mt-6 bg-white/95 rounded-xl p-4 flex items-center gap-4 max-w-xl shadow-lg">
              <div className="relative w-16 h-16 shrink-0 rounded-full overflow-hidden bg-bg-light">
                {managerPhoto ? (
                  <Image
                    src={managerPhoto}
                    alt={managerName}
                    fill
                    sizes="64px"
                    className="object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <User className="h-8 w-8 text-text-muted/40" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-text-dark truncate">{managerName}</p>
                {managerTitle && (
                  <p className="text-sm text-text-muted truncate">{managerTitle}</p>
                )}
              </div>
              {managerHref && (
                <Link
                  href={managerHref}
                  className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary-dark transition-colors shrink-0"
                >
                  Hakkında
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          )}
        </div>
      </section>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        {/* İletişim + Harita */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* İletişim */}
          <div className="bg-white border border-border rounded-xl p-6 shadow-sm">
            <h2 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-4">
              İletişim
            </h2>
            <div className="space-y-4">
              {branch.address && (
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Adres</p>
                    <p className="text-sm text-text-dark">{branch.address}</p>
                  </div>
                </div>
              )}
              {branch.phone && (
                <a
                  href={`tel:${branch.phone}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Telefon</p>
                    <p className="text-sm text-text-dark group-hover:text-primary transition-colors">
                      {branch.phone}
                    </p>
                  </div>
                </a>
              )}
              {branch.email && (
                <a
                  href={`mailto:${branch.email}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">E-posta</p>
                    <p className="text-sm text-text-dark group-hover:text-primary transition-colors break-all">
                      {branch.email}
                    </p>
                  </div>
                </a>
              )}
              {branch.working_hours && (
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                    <Clock className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs text-text-muted">Çalışma Saatleri</p>
                    <p className="text-sm text-text-dark whitespace-pre-line">{branch.working_hours}</p>
                  </div>
                </div>
              )}
              {!branch.address && !branch.phone && !branch.email && !branch.working_hours && (
                <p className="text-sm text-text-muted">İletişim bilgisi eklenmemiş.</p>
              )}
            </div>
          </div>

          {/* Harita */}
          {mapEmbed ? (
            <div className="bg-white border border-border rounded-xl overflow-hidden shadow-sm flex flex-col">
              <div className="relative h-[320px] lg:h-auto lg:flex-1 bg-bg-light">
                <iframe
                  src={mapEmbed}
                  className="absolute inset-0 w-full h-full"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  title={`${branch.name} konumu`}
                  allowFullScreen
                />
              </div>
              <a
                href={mapsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 py-3 text-sm font-medium text-primary hover:bg-primary/5 transition-colors border-t border-border"
              >
                Google Maps'te Aç
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          ) : (
            <div className="bg-white border border-border rounded-xl p-6 shadow-sm flex items-center justify-center min-h-[320px]">
              <div className="text-center text-text-muted">
                <MapPin className="h-10 w-10 mx-auto opacity-30 mb-2" />
                <p className="text-sm">Konum bilgisi eklenmemiş.</p>
              </div>
            </div>
          )}
        </div>

        {/* Hakkında */}
        {branch.description && (
          <div className="bg-white border border-border rounded-xl p-6 lg:p-8 shadow-sm">
            <h2 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-4">
              Hakkında
            </h2>
            <div
              className="prose max-w-none text-text-dark"
              dangerouslySetInnerHTML={{ __html: branch.description }}
            />
          </div>
        )}

        {/* Diğer şubeler */}
        {otherBranches.length > 0 && (
          <div>
            <h2 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
              Diğer Şubeler
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {otherBranches.map((b) => (
                <Link
                  key={b.id}
                  href={b.slug ? `/subeler/${b.slug}` : "#"}
                  className="bg-white border border-border rounded-lg p-3 text-sm hover:shadow-md hover:border-primary/30 transition-all group"
                >
                  <p className="font-medium text-text-dark group-hover:text-primary transition-colors truncate">
                    {b.name}
                  </p>
                  {b.city && (
                    <p className="text-xs text-text-muted mt-0.5 truncate">{b.city}</p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
