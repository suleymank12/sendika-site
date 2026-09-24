import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getPageBySlug } from "@/lib/public-queries";
import { hataVarsaFirlat } from "@/lib/veri-hatasi";
import { notFound } from "next/navigation";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import SafeHtml from "@/components/SafeHtml";
import { sanitizeContentHtml } from "@/lib/sanitize";
import { extractImagesFromHtml, extractTextFromHtml } from "@/lib/utils";
import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  // cache()'li ortak okuyucu — sayfa ile AYNI sorguyu paylaşır (b2).
  // 🔴 Buradaki tekrar dokuz sayfa içinde en pahalısıydı: `content` (tüzük
  // gibi sayfalarda onlarca kB tam HTML) hem burada hem sayfada çekiliyordu.
  const data = await getPageBySlug(tenant.id, params.slug);

  // Kayit yok → sayfa notFound() atar. Eskiden burada "Sayfa" donuyordu ve
  // DEV sunucusu sekmede "Sayfa | <kurum>" gosteriyordu (govde "Sayfa
  // Bulunamadı"). ⚠️ PRODUCTION'da (next start, 23 Eylul 2026 olculdu)
  // notFound() render'i bu donusu KULLANMAZ: basliga kok layout'un
  // varsayilani (<kurum>) ve Next'in kendi `noindex`'i gelir. Metin yine de
  // govdeyle ayni sozu soylesin (dev + ileride davranis degisirse).
  if (!data) return { title: "Sayfa Bulunamadı", robots: { index: false, follow: false } };

  // Her sayfa TEK adreste (23 Eylul 2026): canonical her zaman /sayfa/<slug>.
  // Eski /kurumsal/<slug> adresleri buraya 308 ile gelir
  // (app/(public)/kurumsal/[slug]/page.tsx).
  return buildPublicMetadata({
    path: `/sayfa/${params.slug}`,
    title: data.title,
    description: extractTextFromHtml(data.content) || undefined,
    // 🔴 21 Eylul 2026'ya kadar EKSIKTI: `pages.cover_image` kolonu var,
    // panelde yukleniyor (MediaSection, folder="pages") ve sayfada
    // gosteriliyor — ama paylasim zincirine HIC girmiyordu, yani bu sayfalar
    // kapagi olsa bile kurumun logosuna dusuyordu. Haber/duyuru/album/manset/
    // yonetim gecirirken yalniz sayfa gecirmiyordu (teshis raporu, madde 9/1).
    image: data.cover_image,
  });
}

export default async function DynamicPage({ params }: Props) {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  // Bu sayfa BİLEREK seri kaldı (b2): content_media sorgusu `page.id`
  // istiyor, elimizde yalnız slug var — gerçek bağımlılık.
  const page = await getPageBySlug(tenant.id, params.slug);

  if (!page) notFound();

  // Once sanitize, SONRA gorsel cikarimi: elenen <img>'ler lightbox'a sizmasin.
  const cleanContent = sanitizeContentHtml(page.content);
  const editorImages = extractImagesFromHtml(cleanContent);

  const { data: mediaData, error: mediaError } = await supabase
    .from("content_media")
    .select("url")
    .eq("tenant_id", tenant.id)
    .eq("content_type", "page")
    .eq("content_id", page.id)
    .eq("media_type", "image")
    .order("order", { ascending: true });

  hataVarsaFirlat(mediaError, "sayfa gorselleri"); // BIRINCIL: icerigin parcasi (C7)
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
