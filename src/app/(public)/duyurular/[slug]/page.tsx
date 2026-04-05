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
    .from("announcements")
    .select("title, summary, cover_image")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!data) return { title: "Duyuru Bulunamadı" };

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

export default async function AnnouncementDetailPage({ params }: Props) {
  const supabase = createClient();

  const { data: announcement } = await supabase
    .from("announcements")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!announcement) notFound();

  const { data: otherAnnouncements } = await supabase
    .from("announcements")
    .select("id, title, slug, published_at")
    .eq("is_published", true)
    .neq("id", announcement.id)
    .order("published_at", { ascending: false })
    .limit(5);

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Duyurular", href: "/duyurular" },
          { label: announcement.title },
        ]}
      />

      <article className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {announcement.cover_image && (
              <div className="rounded-xl overflow-hidden mb-6">
                <img src={announcement.cover_image} alt={announcement.title} className="w-full h-auto max-h-[400px] object-cover" />
              </div>
            )}

            <div className="flex items-center gap-1.5 text-sm text-text-muted mb-4">
              <Calendar className="h-4 w-4" />
              <time>{formatDate(announcement.published_at || announcement.created_at)}</time>
            </div>

            <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-6">
              {announcement.title}
            </h1>

            {announcement.summary && (
              <p className="text-lg text-text-muted leading-relaxed mb-6 border-l-4 border-accent pl-4">
                {announcement.summary}
              </p>
            )}

            {announcement.content && (
              <div
                className="prose prose-lg max-w-none text-text-dark"
                dangerouslySetInnerHTML={{ __html: announcement.content }}
              />
            )}
          </div>

          <aside>
            <div className="rounded-xl border border-border bg-white p-5 sticky top-20">
              <h3 className="font-semibold text-text-dark mb-4">Diğer Duyurular</h3>
              {(otherAnnouncements || []).length === 0 ? (
                <p className="text-sm text-text-muted">Başka duyuru bulunmuyor.</p>
              ) : (
                <ul className="space-y-3">
                  {(otherAnnouncements || []).map((item) => (
                    <li key={item.id}>
                      <Link href={`/duyurular/${item.slug}`} className="group block">
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
