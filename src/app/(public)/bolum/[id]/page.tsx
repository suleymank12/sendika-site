import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import Breadcrumb from "@/components/public/Breadcrumb";
import { truncateText } from "@/lib/utils";
import type { HomepageSection, HomepageSectionItem } from "@/types";
import type { Metadata } from "next";

interface Props {
  params: { id: string };
}

function getLucideIcon(name: string | null | undefined) {
  if (!name) return null;
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string }>
  >;
  return icons[name] || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("homepage_sections")
    .select("title")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return { title: "Sayfa Bulunamadı" };
  return { title: data.title };
}

export default async function SectionPage({ params }: Props) {
  const supabase = createClient();

  const { data: sectionData } = await supabase
    .from("homepage_sections")
    .select("*")
    .eq("id", params.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!sectionData) notFound();
  const section = sectionData as HomepageSection;

  if (section.source !== "custom") notFound();

  const { data: itemsData } = await supabase
    .from("homepage_section_items")
    .select("*")
    .eq("section_id", section.id)
    .eq("is_active", true)
    .order("order", { ascending: true });

  const items = (itemsData as HomepageSectionItem[]) || [];

  return (
    <div className="bg-bg-light min-h-screen">
      <Breadcrumb items={[{ label: section.title }]} />

      <section className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-text-dark tracking-tight mb-6">
          {section.title}
        </h1>

        {items.length === 0 ? (
          <p className="text-text-muted text-sm">Henüz öğe eklenmemiş.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ItemCard({ item }: { item: HomepageSectionItem }) {
  const Icon = getLucideIcon(item.icon);
  const href = item.link_url || "#";
  const isExternal = /^https?:\/\//i.test(href);

  const content = (
    <div className="group rounded-lg border border-border bg-white overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col">
      <div className="relative aspect-video bg-primary/5 overflow-hidden">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : Icon ? (
          <div className="h-full w-full flex items-center justify-center">
            <Icon className="h-10 w-10 text-primary/60" />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary/40" />
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">
            {truncateText(item.description, 120)}
          </p>
        )}
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}
