import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import { notFound } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import SafeHtml from "@/components/SafeHtml";
import { sanitizeContentHtml } from "@/lib/sanitize";
import { extractImagesFromHtml } from "@/lib/utils";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data } = await supabase
    .from("pages")
    .select("title")
    .eq("tenant_id", tenant.id)
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  return { title: data?.title || "Sayfa" };
}

export default async function DynamicPage({ params }: Props) {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!page) notFound();

  // Once sanitize, SONRA gorsel cikarimi: elenen <img>'ler lightbox'a sizmasin.
  const cleanContent = sanitizeContentHtml(page.content);
  const editorImages = extractImagesFromHtml(cleanContent);

  const { data: mediaData } = await supabase
    .from("content_media")
    .select("url")
    .eq("tenant_id", tenant.id)
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
      content={cleanContent ? <SafeHtml html={cleanContent} /> : null}
      contentImages={contentImages}
    />
  );
}
