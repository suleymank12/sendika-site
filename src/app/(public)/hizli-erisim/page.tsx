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
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string }>
  >;
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
    <div className="bg-gray-50 min-h-screen">
      <Breadcrumb items={[{ label: "Hızlı Erişim" }]} />

      <section className="max-w-7xl mx-auto py-8 px-4">
        <h1 className="text-2xl font-bold text-text-dark tracking-tight mb-6">
          Hızlı Erişim
        </h1>

        {items.length === 0 ? (
          <p className="text-text-muted text-sm">
            Henüz hızlı erişim öğesi eklenmemiş.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item) => (
              <Tile key={item.id} item={item} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Tile({ item }: { item: QuickAccess }) {
  const Icon = getLucideIcon(item.icon);
  const href = item.url
    ? item.url
    : item.slug
    ? `/hizli-erisim/${item.slug}`
    : "#";

  return (
    <Link
      href={href}
      className="bg-white border border-gray-200 rounded-lg p-6 text-center hover:shadow-md transition cursor-pointer block"
    >
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.image_url}
          alt={item.title}
          className="w-16 h-16 object-contain mx-auto mb-3"
        />
      ) : Icon ? (
        <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center">
          <Icon className="h-12 w-12 text-primary" />
        </div>
      ) : (
        <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center">
          <Building2 className="h-12 w-12 text-primary/60" />
        </div>
      )}
      <span className="block text-base font-medium text-gray-700">
        {item.title}
      </span>
    </Link>
  );
}
