"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface ImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function ImageLightbox({
  images,
  initialIndex,
  onClose,
}: ImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [visible, setVisible] = useState(false);
  const [imgLoaded, setImgLoaded] = useState(false);
  const thumbsRef = useRef<HTMLDivElement>(null);
  const touchStartX = useRef<number | null>(null);

  const goPrev = useCallback(() => {
    setIndex((i) => (i > 0 ? i - 1 : i));
  }, []);

  const goNext = useCallback(() => {
    setIndex((i) => (i < images.length - 1 ? i + 1 : i));
  }, [images.length]);

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => {
      document.body.style.overflow = prevOverflow;
      cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goPrev, goNext, onClose]);

  useEffect(() => {
    setImgLoaded(false);
    const el = thumbsRef.current?.querySelector<HTMLElement>(
      `[data-thumb-index="${index}"]`
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [index]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) goPrev();
      else goNext();
    }
    touchStartX.current = null;
  };

  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  return (
    <div
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      className={`fixed inset-0 z-[9999] flex flex-col bg-black/90 backdrop-blur-md transition-opacity duration-200 ease-out ${
        visible ? "opacity-100" : "opacity-0"
      }`}
    >
      {/* Top bar: counter + close */}
      <div
        onClick={stop}
        className="flex items-center justify-between px-4 py-4 shrink-0"
      >
        <div className="rounded-full bg-white/10 backdrop-blur-sm px-4 py-1.5 text-sm font-medium text-white tabular-nums">
          {index + 1} / {images.length}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white transition-colors hover:bg-white/20 cursor-pointer"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative px-4">
        {hasPrev && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            aria-label="Previous"
            className="absolute left-4 top-1/2 z-10 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur text-white transition-colors hover:bg-black/60 cursor-pointer"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={images[index]}
          alt=""
          onClick={stop}
          onLoad={() => setImgLoaded(true)}
          className={`max-w-[85vw] max-h-[80vh] object-contain rounded-lg shadow-2xl ring-1 ring-white/10 transition-opacity duration-200 ${
            imgLoaded ? "opacity-100" : "opacity-0"
          }`}
        />

        {hasNext && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            aria-label="Next"
            className="absolute right-4 top-1/2 z-10 -translate-y-1/2 flex h-12 w-12 items-center justify-center rounded-full bg-black/40 backdrop-blur text-white transition-colors hover:bg-black/60 cursor-pointer"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div
          onClick={stop}
          className="shrink-0 w-full flex justify-center pb-4 pt-2"
        >
          <div
            ref={thumbsRef}
            className="flex gap-2 max-w-[600px] overflow-x-auto px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            {images.map((src, i) => (
              <button
                key={i}
                type="button"
                data-thumb-index={i}
                onClick={() => setIndex(i)}
                aria-label={`Image ${i + 1}`}
                className={`h-16 w-16 shrink-0 overflow-hidden rounded-md transition-all ${
                  i === index
                    ? "border-2 border-white ring-2 ring-white/50 opacity-100"
                    : "opacity-60 hover:opacity-100"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
