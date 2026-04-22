import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import NewsCard from "@/components/public/NewsCard";
import { extractImagesFromHtml } from "@/lib/utils";
import type { Metadata } from "next";
import type { News } from "@/types";

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

  const item = news as News;

  const { data: related } = await supabase
    .from("news")
    .select("*")
    .eq("is_published", true)
    .neq("id", item.id)
    .order("published_at", { ascending: false })
    .limit(5);

  const relatedNews = ((related as News[]) || []).slice(0, 3);
  const editorImages = extractImagesFromHtml(item.content);

  const { data: mediaData } = await supabase
    .from("content_media")
    .select("url")
    .eq("content_type", "news")
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
        { label: "Haberler", href: "/haberler" },
        { label: item.title },
      ]}
      title={item.title}
      date={item.published_at || item.created_at}
      updatedAt={item.updated_at}
      category={item.category}
      coverImage={item.cover_image}
      videoUrl={item.video_url}
      youtubeUrl={item.youtube_url}
      content={item.content}
      contentImages={contentImages}
      relatedTitle={relatedNews.length > 0 ? "İlgili Haberler" : undefined}
      relatedSection={
        relatedNews.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {relatedNews.map((n) => (
              <NewsCard key={n.id} news={n} />
            ))}
          </div>
        ) : undefined
      }
    />
  );
}
