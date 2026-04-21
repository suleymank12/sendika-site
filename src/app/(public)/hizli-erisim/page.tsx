import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";
import Link from "next/link";
import { Building2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { QuickAccess } from "@/types";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hızlı Erişim",
  description: "Sendika hızlı erişim sayfaları.",
};

function getLucideIcon(name: string | null | undefined) {
  if (!name) return null;
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[name] || null;
}

export default async function QuickAccessListPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from("quick_access")
    .select("*")
    .eq("is_active", true)
    .order("order", { ascending: true });

  const items = (data as QuickAccess[]) || [];

  return (
    <>
      <Breadcrumb items={[{ label: "Hızlı Erişim" }]} />

      <section className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-text-dark tracking-tight mb-6">Hızlı Erişim</h1>

        {items.length === 0 ? (
          <p className="text-text-muted text-sm">Henüz hızlı erişim öğesi bulunmuyor.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {items.map((item) => (
              <Tile key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function Tile({ item }: { item: QuickAccess }) {
  const Icon = getLucideIcon(item.icon);
  const href = item.slug ? `/hizli-erisim/${item.slug}` : item.url || "#";

  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
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
      <div className="p-3 text-center">
        <span className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2">
          {item.title}
        </span>
      </div>
    </Link>
  );
}
