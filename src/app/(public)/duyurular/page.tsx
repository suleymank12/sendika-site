import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";
import { formatDate, truncateText } from "@/lib/utils";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { PAGE_SIZE } from "@/lib/constants";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Duyurular",
  description: "Sendika duyuruları ve bilgilendirmeler",
};

interface Props {
  searchParams: { sayfa?: string };
}

export default async function AnnouncementsListPage({ searchParams }: Props) {
  const page = parseInt(searchParams.sayfa || "1");
  const supabase = createClient();

  const from = (page - 1) * PAGE_SIZE.ANNOUNCEMENTS;
  const to = from + PAGE_SIZE.ANNOUNCEMENTS - 1;

  const { data, count } = await supabase
    .from("announcements")
    .select("*", { count: "exact" })
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .range(from, to);

  const announcements = data || [];
  const totalPages = Math.ceil((count || 0) / PAGE_SIZE.ANNOUNCEMENTS);

  return (
    <>
      <Breadcrumb items={[{ label: "Duyurular" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Duyurular</h1>

        {announcements.length === 0 ? (
          <p className="text-text-muted">Henüz duyuru bulunmuyor.</p>
        ) : (
          <>
            <div className="space-y-4">
              {announcements.map((item) => (
                <Link
                  key={item.id}
                  href={`/duyurular/${item.slug}`}
                  className="group block rounded-xl border border-border bg-white p-5 hover:shadow-md hover:border-primary/20 transition-all"
                >
                  <div className="flex items-center gap-1.5 text-xs text-text-muted">
                    <Calendar className="h-3.5 w-3.5" />
                    <time>{formatDate(item.published_at || item.created_at)}</time>
                  </div>
                  <h3 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors mt-1">
                    {item.title}
                  </h3>
                  {item.summary && (
                    <p className="text-sm text-text-muted mt-1 line-clamp-2">
                      {truncateText(item.summary, 200)}
                    </p>
                  )}
                </Link>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10">
                {page > 1 && (
                  <Link
                    href={`/duyurular${page - 1 > 1 ? `?sayfa=${page - 1}` : ""}`}
                    className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Önceki
                  </Link>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                  <Link
                    key={p}
                    href={`/duyurular${p > 1 ? `?sayfa=${p}` : ""}`}
                    className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                      p === page ? "bg-primary text-white" : "text-text-muted hover:bg-bg-light"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
                {page < totalPages && (
                  <Link
                    href={`/duyurular?sayfa=${page + 1}`}
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
