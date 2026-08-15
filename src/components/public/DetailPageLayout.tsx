"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import ArticleTools from "./ArticleTools";
import ImageLightbox from "./ImageLightbox";
import { formatDate, isNextImageSafeUrl } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DetailPageLayoutProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  /** Duz metin alt baslik (manset). HTML DEGIL — JSX ile escape edilir. */
  subtitle?: string | null;
  date?: string | null;
  updatedAt?: string | null;
  category?: string | null;
  coverImage?: string | null;
  videoUrl?: string | null;
  youtubeUrl?: string | null;
  /**
   * Hazir render edilmis icerik dugumu — tipik olarak <SafeHtml html={...} />.
   * Bilincli olarak string DEGIL: bu bileşen "use client" oldugu icin
   * sanitize edemez, dolayisiyla ham HTML'i buraya hic sokmuyoruz.
   * Sanitize cagiran server component'te yapilir (Guvenlik bulgusu Y2).
   */
  content?: ReactNode;
  contentImages?: string[];
  relatedTitle?: string;
  relatedSection?: ReactNode;
}

function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return null;
}

function truncate(str: string, max: number) {
  return str.length <= max ? str : str.slice(0, max).trimEnd() + "…";
}

type VideoItem =
  | { kind: "file"; src: string }
  | { kind: "youtube"; src: string };

function VideoPlayer({ video, title }: { video: VideoItem; title: string }) {
  if (video.kind === "file") {
    return (
      <div className="w-full aspect-video overflow-hidden bg-black">
        <video src={video.src} controls className="w-full h-full" />
      </div>
    );
  }
  return (
    <div className="w-full aspect-video overflow-hidden bg-black">
      <iframe
        src={video.src}
        className="w-full h-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        title={title}
      />
    </div>
  );
}

export default function DetailPageLayout({
  breadcrumbs,
  title,
  subtitle,
  date,
  updatedAt,
  category,
  coverImage,
  videoUrl,
  youtubeUrl,
  content,
  contentImages = [],
  relatedTitle,
  relatedSection,
}: DetailPageLayoutProps) {
  const [fontSize, setFontSize] = useState(16);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const videos: VideoItem[] = [];
  if (videoUrl) videos.push({ kind: "file", src: videoUrl });
  const youtubeEmbed = youtubeUrl ? getYoutubeEmbedUrl(youtubeUrl) : null;
  if (youtubeEmbed) videos.push({ kind: "youtube", src: youtubeEmbed });

  // next/image tanimadigi src'de HATA FIRLATIR (sayfa 500 olur). cover_image
  // kolonu ne sanitize'dan ne extractImagesFromHtml'den geciyor; bozuk bir
  // kolon degeri de sayfayi cokertmesin diye burada eleniyor.
  const photos: string[] = [];
  if (coverImage && isNextImageSafeUrl(coverImage)) photos.push(coverImage);
  for (const img of contentImages) {
    if (isNextImageSafeUrl(img) && !photos.includes(img)) photos.push(img);
  }

  const videoCount = videos.length;
  const photoCount = photos.length;
  const hasMedia = videoCount > 0 || photoCount > 0;

  // Eskiden alt baslik content string'ine gomuluyordu; ayrildiktan sonra
  // "icerik yok" mesaji yalnizca IKISI de bosken gosterilmeli.
  const showEmptyState = !content && !subtitle;

  const openLightbox = (i: number) => setLightboxIndex(i);

  return (
    <div className="bg-white min-h-screen pb-16">
      {/* Breadcrumb */}
      <nav aria-label="Sayfa yolu" className="w-full bg-transparent border-b border-gray-100 py-3 no-print">
        <div className="max-w-6xl mx-auto px-4 text-sm text-gray-400">
          <ol className="flex items-center flex-wrap">
            {breadcrumbs.map((crumb, i) => {
              const isLast = i === breadcrumbs.length - 1;
              return (
                <li key={i} className="flex items-center min-w-0">
                  {i > 0 && <span className="text-gray-300 mx-2">›</span>}
                  {crumb.href && !isLast ? (
                    <Link
                      href={crumb.href}
                      className="text-gray-500 hover:text-primary transition-colors"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span
                      className={
                        isLast
                          ? "text-gray-600 font-medium truncate"
                          : "text-gray-500"
                      }
                    >
                      {truncate(crumb.label, 60)}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </nav>

      {/* Content card */}
      <div className="max-w-6xl mx-auto mt-6 mb-10 px-4">
        {/* overflow-hidden guvenlik agi olarak duruyor: genis icerik artik
            kirpilmiyor cunku tablo/pre kendi icinde kayar (globals.css .prose
            tasma kurallari) — buraya ulasan tasma kalmamali. */}
        <article className="bg-white border border-gray-200 p-6 lg:p-12 overflow-hidden">
          {/* Title + tools */}
          <div className="flex flex-row items-start justify-between gap-4 border-b border-gray-200 pb-4 mb-6">
            <h1 className="flex-1 text-xl lg:text-2xl font-semibold text-gray-800 leading-snug break-words">
              {title}
            </h1>
            <div className="shrink-0">
              <ArticleTools fontSize={fontSize} onFontSizeChange={setFontSize} />
            </div>
          </div>

          {/* Meta */}
          {(() => {
            const formattedDate = date ? formatDate(date) : null;
            const formattedUpdated = updatedAt ? formatDate(updatedAt) : null;
            const showUpdated =
              formattedUpdated && formattedUpdated !== formattedDate;
            const hasMeta = formattedDate || category || showUpdated;
            if (!hasMeta) return null;
            return (
              <div className="flex flex-wrap items-center gap-3 mb-6">
                {formattedDate && (
                  <time className="text-sm text-gray-400">{formattedDate}</time>
                )}
                {category && (
                  <span className="text-xs text-gray-500 border border-gray-200 px-2 py-0.5">
                    {category}
                  </span>
                )}
                {showUpdated && (
                  <span className="text-xs text-gray-400 italic">
                    Son güncelleme: {formattedUpdated}
                  </span>
                )}
              </div>
            );
          })()}

          {/* Alt başlık — DÜZ METİN (React escape eder, HTML olarak yorumlanmaz) */}
          {subtitle && (
            <p className="text-lg text-gray-600 mb-4">{subtitle}</p>
          )}

          {/* Article text */}
          <div>
            {content ? (
              <div
                className="prose max-w-none break-words text-gray-700 prose-headings:font-semibold prose-headings:text-gray-800 prose-h2:mt-8 prose-h2:mb-3 prose-h3:mt-8 prose-h3:mb-3 prose-p:text-gray-700 prose-p:leading-8 prose-p:mb-5 prose-a:text-primary prose-a:break-words prose-img:my-4 prose-strong:text-gray-800"
                style={{
                  fontSize: `${fontSize}px`,
                  lineHeight: "2rem",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
              >
                {content}
              </div>
            ) : null}
            {showEmptyState && (
              <p className="text-gray-500">Bu sayfa için henüz içerik eklenmemiş.</p>
            )}
          </div>

          {/* Media area */}
          {hasMedia && (
            <div className="border-t border-gray-100 pt-8 mt-8">
              <MediaArea
                videos={videos}
                photos={photos}
                title={title}
                onPhotoClick={openLightbox}
              />
            </div>
          )}
        </article>

        {/* Related */}
        {relatedSection && (
          <section className="max-w-6xl mx-auto mt-10 mb-10 no-print">
            {relatedTitle && (
              <h2 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-3 mb-6">
                {relatedTitle}
              </h2>
            )}
            {relatedSection}
          </section>
        )}
      </div>

      {lightboxIndex !== null && (
        <ImageLightbox
          images={photos}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}

function PhotoGrid({
  photos,
  onClick,
  startIndex = 0,
}: {
  photos: string[];
  onClick: (i: number) => void;
  startIndex?: number;
}) {
  return (
    <div>
      <h2 className="text-base font-semibold text-gray-800 mb-4">Resimler</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
        {photos.map((src, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onClick(startIndex + i)}
            className="relative aspect-square w-full cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-shadow"
            aria-label={`Görsel ${i + 1}`}
          >
            <SafeImage
              src={src}
              alt=""
              fill
              sizes="(max-width: 768px) 33vw, 150px"
              className="object-cover"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function PhotoSidebar({
  src,
  onClick,
  index,
}: {
  src: string;
  onClick: (i: number) => void;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(index)}
      className="relative w-full aspect-video overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
      aria-label="Görsel"
    >
      <SafeImage
        src={src}
        alt=""
        fill
        sizes="(max-width: 1024px) 100vw, 300px"
        className="object-cover"
      />
    </button>
  );
}

function MediaArea({
  videos,
  photos,
  title,
  onPhotoClick,
}: {
  videos: VideoItem[];
  photos: string[];
  title: string;
  onPhotoClick: (i: number) => void;
}) {
  const v = videos.length;
  const p = photos.length;

  if (v === 0) {
    return <PhotoGrid photos={photos} onClick={onPhotoClick} />;
  }

  if (p === 0) {
    if (v === 1) {
      return (
        <div className="max-w-2xl mx-auto">
          <VideoPlayer video={videos[0]} title={title} />
        </div>
      );
    }
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
        {videos.map((vid, i) => (
          <VideoPlayer key={i} video={vid} title={title} />
        ))}
      </div>
    );
  }

  if (v === 1 && p === 1) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
        <VideoPlayer video={videos[0]} title={title} />
        <PhotoSidebar src={photos[0]} onClick={onPhotoClick} index={0} />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {v === 1 ? (
        <VideoPlayer video={videos[0]} title={title} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
          {videos.map((vid, i) => (
            <VideoPlayer key={i} video={vid} title={title} />
          ))}
        </div>
      )}
      <PhotoGrid photos={photos} onClick={onPhotoClick} />
    </div>
  );
}
