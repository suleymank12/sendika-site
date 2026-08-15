"use client";

import { useState } from "react";
import SafeImage from "@/components/SafeImage";
import ImageLightbox from "@/components/public/ImageLightbox";
import { GalleryImage } from "@/types";
import { isNextImageSafeUrl } from "@/lib/utils";

interface GalleryGridProps {
  images: GalleryImage[];
}

export default function GalleryGrid({ images }: GalleryGridProps) {
  // Bozuk image_url'li kayitlar BASTA elenir — per-item null render etmek
  // izgarada bos kutu birakir VE lightbox index matematigini kaydirirdi
  // (ok tuslari bos slaytlara giderdi). Izgara da ImageLightbox'a giden
  // diziler de ayni safeImages'ten turedigi icin index'ler hizali kalir
  // (ImageLightbox sozlesmesi: filtreyi cagiran yapar).
  const safeImages = images.filter((img) => isNextImageSafeUrl(img.image_url));

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {safeImages.map((img, i) => (
          <button
            key={img.id}
            onClick={() => setLightboxIndex(i)}
            className="group relative aspect-square rounded-lg overflow-hidden bg-bg-light"
            aria-label={img.caption || `Görsel ${i + 1}`}
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

      {lightboxIndex !== null && (
        <ImageLightbox
          images={safeImages.map((img) => img.image_url)}
          captions={safeImages.map((img) => img.caption)}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </>
  );
}
