"use client";

import { useState } from "react";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { GalleryImage } from "@/types";

interface GalleryGridProps {
  images: GalleryImage[];
}

export default function GalleryGrid({ images }: GalleryGridProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const prev = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : images.length - 1));
  const next = () => setLightboxIndex((i) => (i !== null && i < images.length - 1 ? i + 1 : 0));

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {images.map((img, i) => (
          <button
            key={img.id}
            onClick={() => openLightbox(i)}
            className="group relative aspect-square rounded-lg overflow-hidden bg-bg-light"
          >
            <Image
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
          {/* Lightbox görseli: aspect ratio bilinmediği için next/image uygun değil, LCP'yi de etkilemez */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[lightboxIndex].image_url}
            alt={images[lightboxIndex].caption || ""}
            className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
          {images[lightboxIndex].caption && (
            <p className="absolute bottom-6 text-center text-white/80 text-sm">
              {images[lightboxIndex].caption}
            </p>
          )}
        </div>
      )}
    </>
  );
}
