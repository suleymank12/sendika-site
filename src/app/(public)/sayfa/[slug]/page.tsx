import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import { extractImagesFromHtml } from "@/lib/utils";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("pages")
    .select("title")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  return { title: data?.title || "Sayfa" };
}

export default async function DynamicPage({ params }: Props) {
  const supabase = createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!page) notFound();

  const editorImages = extractImagesFromHtml(page.content);

  const { data: mediaData } = await supabase
    .from("content_media")
    .select("url")
    .eq("content_type", "page")
    .eq("content_id", page.id)
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
        { label: page.title },
      ]}
      title={page.title}
      coverImage={page.cover_image}
      videoUrl={page.video_url}
      youtubeUrl={page.youtube_url}
      content={page.content}
      contentImages={contentImages}
    />
  );
}
