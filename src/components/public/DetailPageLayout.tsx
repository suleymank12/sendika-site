"use client";

import { useState, ReactNode } from "react";
import Link from "next/link";
import ArticleTools from "./ArticleTools";
import ImageLightbox from "./ImageLightbox";
import { formatDate } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface DetailPageLayoutProps {
  breadcrumbs: BreadcrumbItem[];
  title: string;
  date?: string | null;
  category?: string | null;
  coverImage?: string | null;
  videoUrl?: string | null;
  youtubeUrl?: string | null;
  content?: string | null;
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
  date,
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

  const photos: string[] = [];
  if (coverImage) photos.push(coverImage);
  for (const img of contentImages) {
    if (!photos.includes(img)) photos.push(img);
  }

  const videoCount = videos.length;
  const photoCount = photos.length;
  const hasMedia = videoCount > 0 || photoCount > 0;

  const openLightbox = (i: number) => setLightboxIndex(i);

  return (
    <div className="bg-white min-h-screen pb-16">
      {/* Breadcrumb */}
      <nav className="w-full bg-transparent border-b border-gray-100 py-3 no-print">
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
          {(date || category) && (
            <div className="flex items-center gap-3 mb-6">
              {date && (
                <time className="text-sm text-gray-400">{formatDate(date)}</time>
              )}
              {category && (
                <span className="text-xs text-gray-500 border border-gray-200 px-2 py-0.5">
                  {category}
                </span>
              )}
            </div>
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
                dangerouslySetInnerHTML={{ __html: content }}
              />
            ) : (
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
          title={title}
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
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 lg:gap-4">
      {photos.map((src, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onClick(startIndex + i)}
          className="aspect-square w-full cursor-pointer overflow-hidden shadow-sm hover:shadow-md transition-shadow"
          aria-label={`Görsel ${i + 1}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="w-full h-full object-cover" />
        </button>
      ))}
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
      className="w-full aspect-video overflow-hidden cursor-pointer shadow-sm hover:shadow-md transition-shadow"
      aria-label="Görsel"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="w-full h-full object-cover" />
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
        <div className="max-w-3xl mx-auto">
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
