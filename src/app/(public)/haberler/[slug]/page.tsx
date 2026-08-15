import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import { notFound } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import NewsCard from "@/components/public/NewsCard";
import SafeHtml from "@/components/SafeHtml";
import { sanitizeContentHtml } from "@/lib/sanitize";
import { extractImagesFromHtml } from "@/lib/utils";
import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import type { News } from "@/types";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data } = await supabase
    .from("news")
    .select("title, summary, cover_image, published_at, updated_at")
    .eq("tenant_id", tenant.id)
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!data) return { title: "Haber Bulunamadı" };

  return buildPublicMetadata({
    path: `/haberler/${params.slug}`,
    title: data.title,
    description: data.summary || undefined,
    image: data.cover_image,
    article: {
      publishedTime: data.published_at,
      modifiedTime: data.updated_at,
    },
  });
}

export default async function NewsDetailPage({ params }: Props) {
  const supabase = createClient();
  const tenant = await getCurrentTenant();

  const { data: news } = await supabase
    .from("news")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!news) notFound();

  const item = news as News;

  const { data: related } = await supabase
    .from("news")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("is_published", true)
    .neq("id", item.id)
    .order("published_at", { ascending: false })
    .limit(5);

  const relatedNews = ((related as News[]) || []).slice(0, 3);
  // Once sanitize, SONRA gorsel cikarimi: elenen <img>'ler lightbox'a sizmasin.
  const cleanContent = sanitizeContentHtml(item.content);
  const editorImages = extractImagesFromHtml(cleanContent);

  const { data: mediaData } = await supabase
    .from("content_media")
    .select("url")
    .eq("tenant_id", tenant.id)
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
      content={cleanContent ? <SafeHtml html={cleanContent} /> : null}
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
