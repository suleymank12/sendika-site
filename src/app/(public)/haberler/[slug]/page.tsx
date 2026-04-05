import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/public/Breadcrumb";
import { formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("news")
    .select("title, summary, cover_image")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!data) return { title: "Haber Bulunamadı" };

  return {
    title: data.title,
    description: data.summary || undefined,
    openGraph: {
      title: data.title,
      description: data.summary || undefined,
      images: data.cover_image ? [data.cover_image] : undefined,
    },
  };
}

export default async function NewsDetailPage({ params }: Props) {
  const supabase = createClient();

  const { data: news } = await supabase
    .from("news")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!news) notFound();

  const { data: otherNews } = await supabase
    .from("news")
    .select("id, title, slug, published_at")
    .eq("is_published", true)
    .neq("id", news.id)
    .order("published_at", { ascending: false })
    .limit(5);

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Haberler", href: "/haberler" },
          { label: news.title },
        ]}
      />

      <article className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main content */}
          <div className="lg:col-span-2">
            {news.cover_image && (
              <div className="relative w-full aspect-video overflow-hidden rounded-xl mb-6">
                <img src={news.cover_image} alt={news.title} className="w-full h-full object-cover" />
              </div>
            )}

            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center gap-1.5 text-sm text-text-muted">
                <Calendar className="h-4 w-4" />
                <time>{formatDate(news.published_at || news.created_at)}</time>
              </div>
              {news.category && (
                <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                  {news.category}
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-6">
              {news.title}
            </h1>

            {news.summary && (
              <p className="text-lg text-text-muted leading-relaxed mb-6 border-l-4 border-primary pl-4">
                {news.summary}
              </p>
            )}

            {news.content && (
              <div
                className="prose prose-lg max-w-none text-text-dark"
                dangerouslySetInnerHTML={{ __html: news.content }}
              />
            )}
          </div>

          {/* Sidebar */}
          <aside>
            <div className="rounded-xl border border-border bg-white p-5 sticky top-20">
              <h3 className="font-semibold text-text-dark mb-4">Diğer Haberler</h3>
              {(otherNews || []).length === 0 ? (
                <p className="text-sm text-text-muted">Başka haber bulunmuyor.</p>
              ) : (
                <ul className="space-y-3">
                  {(otherNews || []).map((item) => (
                    <li key={item.id}>
                      <Link href={`/haberler/${item.slug}`} className="group block">
                        <h4 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        <p className="text-xs text-text-muted mt-0.5">
                          {formatDate(item.published_at)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </article>
    </>
  );
}
