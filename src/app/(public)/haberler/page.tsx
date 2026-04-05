import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";
import NewsCard from "@/components/public/NewsCard";
import { PAGE_SIZE } from "@/lib/constants";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Haberler",
  description: "En güncel haberler ve gelişmeler",
};

interface Props {
  searchParams: { sayfa?: string };
}

export default async function NewsListPage({ searchParams }: Props) {
  const page = parseInt(searchParams.sayfa || "1");
  const supabase = createClient();

  const from = (page - 1) * PAGE_SIZE.NEWS;
  const to = from + PAGE_SIZE.NEWS - 1;

  const { data, count } = await supabase
    .from("news")
    .select("*", { count: "exact" })
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .range(from, to);

  const news = data || [];
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE.NEWS);

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
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <a
                    key={p}
                    href={`/haberler?sayfa=${p}`}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                      p === page
                        ? "bg-primary text-white"
                        : "text-text-muted hover:bg-bg-light"
                    }`}
                  >
                    {p}
                  </a>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
