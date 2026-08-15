// Supabase SQL Editor'de çalıştırın (kolon yoksa ekler):
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS content TEXT;

import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import { notFound, redirect } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import SafeHtml from "@/components/SafeHtml";
import { sanitizeContentHtml } from "@/lib/sanitize";
import { extractImagesFromHtml } from "@/lib/utils";
import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";
import type { Headline } from "@/types";

interface Props {
  params: { id: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data } = await supabase
    .from("headlines")
    .select("title, subtitle, image_url")
    .eq("tenant_id", tenant.id)
    .eq("id", params.id)
    .maybeSingle();

  if (!data) return { title: "Manşet Bulunamadı" };

  return buildPublicMetadata({
    path: `/manset/${params.id}`,
    title: data.title,
    description: data.subtitle || undefined,
    image: data.image_url,
  });
}

export default async function MansetDetailPage({ params }: Props) {
  const supabase = createClient();
  const tenant = await getCurrentTenant();

  // is_active filtresi yok — pasif manşetlere de direkt URL ile erişilebilsin
  const { data, error } = await supabase
    .from("headlines")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", params.id)
    .maybeSingle();

  if (error) {
    console.error("[manset/[id]] Supabase sorgu hatası:", error.message);
  }

  if (!data) {
    console.warn("[manset/[id]] Manşet bulunamadı, id:", params.id);
    notFound();
  }

  const item = data as Headline;

  // Haber/duyuru kaynağı varsa orijinal sayfaya yönlendir
  if (item.source_type === "news" && item.source_id) {
    const { data: news } = await supabase
      .from("news")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .eq("id", item.source_id)
      .maybeSingle();
    if (news?.slug) redirect(`/haberler/${news.slug}`);
  }
  if (item.source_type === "announcement" && item.source_id) {
    const { data: ann } = await supabase
      .from("announcements")
      .select("slug")
      .eq("tenant_id", tenant.id)
      .eq("id", item.source_id)
      .maybeSingle();
    if (ann?.slug) redirect(`/duyurular/${ann.slug}`);
  }

  // Harici link_url varsa oraya yönlendir
  if (item.link_url && /^https?:\/\//i.test(item.link_url)) {
    redirect(item.link_url);
  }

  // Once sanitize, SONRA gorsel cikarimi: elenen <img>'ler lightbox'a sizmasin.
  const cleanContent = sanitizeContentHtml(item.content);
  const contentImages = extractImagesFromHtml(cleanContent);

  return (
    <DetailPageLayout
      breadcrumbs={[
        { label: "Anasayfa", href: "/" },
        { label: "Manşet" },
        { label: item.title },
      ]}
      title={item.title}
      subtitle={item.subtitle}
      date={item.created_at}
      coverImage={item.image_url}
      videoUrl={item.video_url}
      youtubeUrl={item.youtube_url}
      content={cleanContent ? <SafeHtml html={cleanContent} /> : null}
      contentImages={contentImages}
    />
  );
}
