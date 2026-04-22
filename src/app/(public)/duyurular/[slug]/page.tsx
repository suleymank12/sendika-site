import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import { extractImagesFromHtml, formatDate } from "@/lib/utils";
import { Calendar } from "lucide-react";
import type { Metadata } from "next";
import type { Announcement } from "@/types";

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

  const { data } = await supabase
    .from("announcements")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!data) notFound();

  const item = data as Announcement;

  const { data: related } = await supabase
    .from("announcements")
    .select("*")
    .eq("is_published", true)
    .neq("id", item.id)
    .order("published_at", { ascending: false })
    .limit(5);

  const relatedItems = ((related as Announcement[]) || []).slice(0, 3);
  const editorImages = extractImagesFromHtml(item.content);

  const { data: mediaData } = await supabase
    .from("content_media")
    .select("url")
    .eq("content_type", "announcement")
    .eq("content_id", item.id)
    .eq("media_type", "image")
    .order("order", { ascending: true });

  const galleryUrls = (mediaData || []).map((m) => m.url as string);
  const contentImages: string[] = [];
  for (const url of [...galleryUrls, ...editorImages]) {
    if (!contentImages.includes(url)) contentImages.push(url);
  }

  return (
    <DetailPageLayout
      breadcrumbs={[
        { label: "Anasayfa", href: "/" },
        { label: "Duyurular", href: "/duyurular" },
        { label: item.title },
      ]}
      title={item.title}
      date={item.published_at || item.created_at}
      updatedAt={item.updated_at}
      coverImage={item.cover_image}
      videoUrl={item.video_url}
      youtubeUrl={item.youtube_url}
      content={item.content}
      contentImages={contentImages}
      relatedTitle={relatedItems.length > 0 ? "İlgili Duyurular" : undefined}
      relatedSection={
        relatedItems.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedItems.map((a) => (
              <Link
                key={a.id}
                href={`/duyurular/${a.slug}`}
                className="group block rounded-lg border border-gray-200 bg-white p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
                  <Calendar className="h-3.5 w-3.5" />
                  <time>{formatDate(a.published_at || a.created_at)}</time>
                </div>
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors line-clamp-3">
                  {a.title}
                </h3>
              </Link>
            ))}
          </div>
        ) : undefined
      }
    />
  );
}
