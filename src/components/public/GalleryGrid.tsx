"use client";

import { useState } from "react";
import SafeImage from "@/components/SafeImage";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { GalleryImage } from "@/types";
import { isNextImageSafeUrl } from "@/lib/utils";

interface GalleryGridProps {
  images: GalleryImage[];
}

export default function GalleryGrid({ images }: GalleryGridProps) {
  // Bozuk image_url'li kayitlar BASTA elenir — per-item null render etmek
  // izgarada bos kutu birakir VE lightbox index matematigini kaydirirdi
  // (ok tuslari bos slaytlara giderdi). Dogru yer kaynak: DetailPageLayout'un
  // photos[] deseninin aynisi.
  const safeImages = images.filter((img) => isNextImageSafeUrl(img.image_url));

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const prev = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : safeImages.length - 1));
  const next = () => setLightboxIndex((i) => (i !== null && i < safeImages.length - 1 ? i + 1 : 0));

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {safeImages.map((img, i) => (
          <button
            key={img.id}
            onClick={() => openLightbox(i)}
            className="group relative aspect-square rounded-lg overflow-hidden bg-bg-light"
          >
            <SafeImage
              src={img.image_url}
              alt={img.caption || ""}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90" onClick={closeLightbox}>
          <button onClick={closeLightbox} className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
            <X className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 text-white/70 hover:text-white p-2"
          >
            <ChevronLeft className="h-8 w-8" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 text-white/70 hover:text-white p-2"
          >
            <ChevronRight className="h-8 w-8" />
          </button>
          <SafeImage
            src={safeImages[lightboxIndex].image_url}
            alt={safeImages[lightboxIndex].caption || ""}
            width={1920}
            height={1080}
            unoptimized
            className="max-h-[85vh] max-w-[90vw] w-auto h-auto object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {safeImages[lightboxIndex].caption && (
            <p className="absolute bottom-6 text-center text-white/80 text-sm">
              {safeImages[lightboxIndex].caption}
            </p>
          )}
        </div>
      )}
    </>
  );
}
