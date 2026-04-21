import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import { extractImagesFromHtml } from "@/lib/utils";
import type { Metadata } from "next";
import type { QuickAccess } from "@/types";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("quick_access")
    .select("title, image_url")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) return { title: "Sayfa Bulunamadı" };

  return {
    title: data.title,
    openGraph: {
      title: data.title,
      images: data.image_url ? [data.image_url] : undefined,
    },
  };
}

export default async function QuickAccessDetailPage({ params }: Props) {
  const supabase = createClient();
  const { data } = await supabase
    .from("quick_access")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_active", true)
    .maybeSingle();

  if (!data) notFound();

  const item = data as QuickAccess;
  const contentImages = extractImagesFromHtml(item.content);

  return (
    <DetailPageLayout
      breadcrumbs={[
        { label: "Anasayfa", href: "/" },
        { label: "Hızlı Erişim", href: "/hizli-erisim" },
        { label: item.title },
      ]}
      title={item.title}
      coverImage={item.image_url}
      videoUrl={item.video_url}
      youtubeUrl={item.youtube_url}
      content={item.content}
      contentImages={contentImages}
    />
  );
}
