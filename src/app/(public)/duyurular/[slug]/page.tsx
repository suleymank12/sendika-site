import { createPublicClient } from "@/lib/supabase/public";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getAnnouncementBySlug } from "@/lib/public-queries";
import { hataVarsaFirlat, ikincilHata } from "@/lib/veri-hatasi";
import { notFound } from "next/navigation";
import Link from "next/link";
import DetailPageLayout from "@/components/public/DetailPageLayout";
import SafeHtml from "@/components/SafeHtml";
import { sanitizeContentHtml } from "@/lib/sanitize";
import { extractImagesFromHtml, formatDate } from "@/lib/utils";
import { buildPublicMetadata } from "@/lib/seo";
import { Calendar } from "lucide-react";
import type { Metadata } from "next";
import type { Announcement } from "@/types";

interface Props {
  params: { slug: string };
}

/**
 * İlgili duyuru kartının kullandığı kolonlar (b2/b1). Kart yalnızca tarih +
 * başlık gösteriyor; `content` BİLEREK yok.
 */
const RELATED_COLUMNS = "id, slug, title, published_at, created_at";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  // cache()'li ortak okuyucu — sayfa ile AYNI sorguyu paylaşır (b2).
  const data = await getAnnouncementBySlug(tenant.id, params.slug);

  if (!data) return { title: "Duyuru Bulunamadı" };

  return buildPublicMetadata({
    path: `/duyurular/${params.slug}`,
    title: data.title,
    description: data.summary || undefined,
    image: data.cover_image,
    article: {
      publishedTime: data.published_at,
      modifiedTime: data.updated_at,
    },
  });
}

export default async function AnnouncementDetailPage({ params }: Props) {
  const supabase = createPublicClient();
  const tenant = await getCurrentTenant();

  // 1. DALGA — duyurunun kendisi + ilgili duyurular PARALEL (b2).
  // `.neq("id", item.id)` yerine `.neq("slug", params.slug)`: bağımlılık
  // kalkıyor. Güvenli: `announcements_tenant_slug_key` UNIQUE (tenant_id, slug).
  const [data, relatedRes] = await Promise.all([
    getAnnouncementBySlug(tenant.id, params.slug),
    supabase
      .from("announcements")
      .select(RELATED_COLUMNS)
      .eq("tenant_id", tenant.id)
      .eq("is_published", true)
      .neq("slug", params.slug)
      .order("published_at", { ascending: false })
      .limit(3),
  ]);

  if (!data) notFound();

  const item = data;

  // limit(5) + slice(3) idi; artık limit(3).
  // IKINCIL (C7): "ilgili duyurular" yan parca.
  ikincilHata(relatedRes.error, "ilgili duyurular");
  const relatedItems = (relatedRes.error ? [] : (relatedRes.data as unknown as Announcement[])) || [];
  // Once sanitize, SONRA gorsel cikarimi: elenen <img>'ler lightbox'a sizmasin.
  const cleanContent = sanitizeContentHtml(item.content);
  const editorImages = extractImagesFromHtml(cleanContent);

  // 2. DALGA — content_media GERÇEKTEN bağımlı (`item.id` lazım).
  const { data: mediaData, error: mediaError } = await supabase
    .from("content_media")
    .select("url")
    .eq("tenant_id", tenant.id)
    .eq("content_type", "announcement")
    .eq("content_id", item.id)
    .eq("media_type", "image")
    .order("order", { ascending: true });

  hataVarsaFirlat(mediaError, "duyuru gorselleri"); // BIRINCIL: icerigin parcasi (C7)
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
      content={cleanContent ? <SafeHtml html={cleanContent} /> : null}
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
