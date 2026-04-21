"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
  title?: string;
}

export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
  title,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [visible, setVisible] = useState(false);
  const thumbsRef = useRef<HTMLDivElement>(null);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : i));
  }, [images.length]);

  // Body scroll kilidi + açılış animasyonu
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(frame);
    };
  }, []);

  // Klavye: Escape, ArrowLeft, ArrowRight
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  // Aktif thumbnail'ı görünür alana kaydır
  useEffect(() => {
    const el = thumbsRef.current?.querySelector<HTMLElement>(
      `[data-thumb-index="${index}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [index]);

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-[9999] bg-black/90 flex flex-col transition-opacity duration-200 ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Üst bar: başlık + sayaç + X */}
      <div
        onClick={stop}
        className="flex items-center justify-between px-4 py-3 shrink-0"
      >
        <span className="text-white text-sm truncate flex-1 mr-4">
          {title ? <span className="font-medium">{title} </span> : null}
          <span className="text-white/70">
            ({index + 1} / {images.length})
          </span>
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Kapat"
          className="w-10 h-10 flex items-center justify-center bg-white/20 hover:bg-white/40 rounded-full text-white cursor-pointer transition-colors shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Orta: görsel + sol/sağ oklar */}
      <div
        onClick={stop}
        className="flex-1 flex items-center justify-center relative px-4 sm:px-16"
      >
        {hasPrev && (
          <button
            type="button"
            onClick={goPrev}
            aria-label="Önceki"
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[index]}
          alt={title || "Görsel"}
          className="max-w-[85vw] max-h-[70vh] object-contain mx-auto transition-opacity duration-150"
        />

        {hasNext && (
          <button
            type="button"
            onClick={goNext}
            aria-label="Sonraki"
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 w-12 h-12 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Alt: thumbnail strip — mobilde gizli */}
      {images.length > 1 && (
        <div
          ref={thumbsRef}
          onClick={stop}
          className="hidden sm:flex shrink-0 justify-center gap-2 px-4 py-3 overflow-x-auto"
        >
          {images.map((src, i) => (
            <button
              key={i}
              type="button"
              data-thumb-index={i}
              onClick={() => setIndex(i)}
              aria-label={`Görsel ${i + 1}`}
              className={`w-16 h-16 rounded overflow-hidden cursor-pointer shrink-0 transition-opacity ${
                i === index
                  ? "ring-2 ring-white opacity-100"
                  : "opacity-60 hover:opacity-100"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
