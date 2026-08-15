import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import Breadcrumb from "@/components/public/Breadcrumb";
import NewsCard from "@/components/public/NewsCard";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { News } from "@/types";

import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";

const PER_PAGE = 9;

interface Props {
  searchParams: { sayfa?: string };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  // Sayfalama canonical'da korunur: 2. sayfayi 1.'e isaretlemek yanlis
  // sinyal olur (Google self-canonical onerir), her sayfa kendini gosterir.
  const page = parseInt(searchParams.sayfa || "1");
  return buildPublicMetadata({
    path: page > 1 ? `/haberler?sayfa=${page}` : "/haberler",
    title: "Haberler",
    description: "En güncel haberler ve gelişmeler",
  });
}

export default async function NewsListPage({ searchParams }: Props) {
  const page = parseInt(searchParams.sayfa || "1");
  const supabase = createClient();
  const tenant = await getCurrentTenant();

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  // content (rich text, buyuk) listede BILEREK cekilmiyor. Kolon listesi
  // NewsCard'in kullandigi alanlar: slug, cover_image, title, category,
  // published_at, created_at, summary (+ key icin id). Karta alan
  // eklenirse burasi da guncellenmeli.
  const { data, count } = await supabase
    .from("news")
    .select("id, slug, title, summary, cover_image, category, published_at, created_at", {
      count: "exact",
    })
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .range(from, to);

  // Kolon listesi News tipinin alt kumesi — NewsCard yalnizca bu alanlari
  // kullaniyor (anasayfadaki desenle ayni cast).
  const news = (data as unknown as News[]) || [];
  const totalPages = Math.ceil((count || 0) / PER_PAGE);

  const hrefFor = (p: number) => `/haberler${p > 1 ? `?sayfa=${p}` : ""}`;

  return (
    <>
      <Breadcrumb items={[{ label: "Haberler" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Haberler</h1>

        {news.length === 0 ? (
          <p className="text-text-muted">Henüz haber bulunmuyor.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {news.map((item) => (
                <NewsCard key={item.id} news={item} headingLevel="h2" />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {page > 1 && (
                  <Link
                    href={hrefFor(page - 1)}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Önceki
                  </Link>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={hrefFor(p)}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                      p === page
                        ? "bg-primary text-white"
                        : "text-text-muted hover:bg-bg-light"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
                {page < totalPages && (
                  <Link
                    href={hrefFor(page + 1)}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
                  >
                    Sonraki
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
