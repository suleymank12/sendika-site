import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getNewsBySlug } from "@/lib/public-queries";
import { hataVarsaFirlat, ikincilHata } from "@/lib/veri-hatasi";
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

/**
 * İlgili haber kartının (NewsCard) kullandığı kolonlar (b2/b1).
 * `content` (ort. 6 kB HTML) BİLEREK yok — kartta gösterilmiyor, 5 satırda
 * ~30 kB boşuna taşınıyordu.
 */
const RELATED_COLUMNS =
  "id, slug, title, summary, cover_image, category, published_at, created_at";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  // cache()'li ortak okuyucu — sayfa ile AYNI sorguyu paylaşır, DB'ye tek
  // istek gider (b2). Eskiden burada ayrı bir 5 kolonluk sorgu vardı.
  const data = await getNewsBySlug(tenant.id, params.slug);

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
  const supabase = createPublicClient();
  const tenant = await getCurrentTenant();

  // 1. DALGA — haberin kendisi + ilgili haberler PARALEL (b2).
  //
  // İlgili haberler eskiden `.neq("id", item.id)` kullandığı için haberin
  // gelmesini BEKLİYORDU. `.neq("slug", params.slug)` aynı satırı eler ama
  // elde olan parametreye dayanır → bağımlılık tamamen kalkar, sorgu bu
  // dalgaya iner. Güvenli: `news_tenant_slug_key` UNIQUE (tenant_id, slug).
  const [news, relatedRes] = await Promise.all([
    getNewsBySlug(tenant.id, params.slug),
    supabase
      .from("news")
      .select(RELATED_COLUMNS)
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .neq("slug", params.slug)
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  if (!news) notFound();

  const item = news;

  // limit(5) + slice(3) idi: 2 satır hep boşuna geliyordu, artık limit(3).
  // IKINCIL (C7): "ilgili haberler" yan parca — hata → parca gizlenir + log.
  ikincilHata(relatedRes.error, "ilgili haberler");
  const relatedNews = (relatedRes.error ? [] : (relatedRes.data as unknown as News[])) || [];
  // Once sanitize, SONRA gorsel cikarimi: elenen <img>'ler lightbox'a sizmasin.
  const cleanContent = sanitizeContentHtml(item.content);
  const editorImages = extractImagesFromHtml(cleanContent);

  // 2. DALGA — content_media GERÇEKTEN bağımlı: `item.id` lazım, elimizde
  // yalnız slug var. Paralelleştirilemez.
  const { data: mediaData, error: mediaError } = await supabase
    .from("content_media")
    .select("url")
    .eq("tenant_id", tenant.id)
    .eq("content_type", "news")
    .eq("content_id", item.id)
    .eq("media_type", "image")
    .order("order", { ascending: true });

  hataVarsaFirlat(mediaError, "haber gorselleri"); // BIRINCIL: icerigin parcasi
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
