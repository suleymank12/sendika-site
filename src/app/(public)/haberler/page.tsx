import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";
import NewsCard from "@/components/public/NewsCard";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Haberler",
  description: "En güncel haberler ve gelişmeler",
};

const PER_PAGE = 7;

interface Props {
  searchParams: { sayfa?: string };
}

export default async function NewsListPage({ searchParams }: Props) {
  const page = parseInt(searchParams.sayfa || "1");
  const supabase = createClient();

  const from = (page - 1) * PER_PAGE;
  const to = from + PER_PAGE - 1;

  const { data, count } = await supabase
    .from("news")
    .select("*", { count: "exact" })
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .range(from, to);

  const news = data || [];
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
                <NewsCard key={item.id} news={item} />
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
