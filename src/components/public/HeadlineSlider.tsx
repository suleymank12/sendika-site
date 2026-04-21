"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import { ChevronLeft, ChevronRight, Newspaper } from "lucide-react";
import { Headline, Slider } from "@/types";
import { cn } from "@/lib/utils";

interface HeadlineSliderProps {
  headlines: Headline[];
  fallbackSliders?: Slider[];
}

type Slide = {
  id: string;
  title: string | null;
  subtitle: string | null;
  image_url: string | null;
  href: string | null;
};

function resolveHeadlineHref(h: Headline): string {
  if (h.source_type === "news" && h.source_slug) {
    return `/haberler/${h.source_slug}`;
  }
  if (h.source_type === "announcement" && h.source_slug) {
    return `/duyurular/${h.source_slug}`;
  }
  if (h.link_url && h.link_url.trim()) return h.link_url.trim();
  return `/manset/${h.id}`;
}

function isExternal(url: string): boolean {
  return /^(https?:)?\/\//i.test(url);
}

export default function HeadlineSlider({ headlines, fallbackSliders = [] }: HeadlineSliderProps) {
  const router = useRouter();
  const swiperRef = useRef<SwiperType | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const slides: Slide[] =
    headlines.length > 0
      ? headlines.map((h) => ({
          id: h.id,
          title: h.title,
          subtitle: h.subtitle,
          image_url: h.image_url,
          href: resolveHeadlineHref(h),
        }))
      : fallbackSliders.map((s) => ({
          id: s.id,
          title: s.title,
          subtitle: s.subtitle,
          image_url: s.image_url,
          // Slider fallback: sadece link_url varsa tıklanır, /manset/{id}'ye düşmez
          href: s.link_url && s.link_url.trim() ? s.link_url.trim() : null,
        }));

  if (slides.length === 0) {
    return (
      <div className="relative h-[350px] lg:h-[450px] bg-primary flex items-center justify-center rounded-xl overflow-hidden">
        <div className="text-center text-white">
          <Newspaper className="h-12 w-12 mx-auto mb-3 opacity-60" />
          <h2 className="text-xl font-bold">Manşet Eklenmemiş</h2>
          <p className="mt-1 text-sm text-white/70">Admin panelden manşet ekleyebilirsiniz.</p>
        </div>
      </div>
    );
  }

  const handleBulletClick = (index: number) => {
    const swiper = swiperRef.current;
    if (!swiper) return;
    if (swiper.params.loop) {
      swiper.slideToLoop(index);
    } else {
      swiper.slideTo(index);
    }
  };

  const handleSlideClick = (href: string | null) => {
    if (!href) return;
    console.log("[HeadlineSlider] tıklandı, gidiliyor:", href);
    if (isExternal(href)) {
      window.location.href = href;
      return;
    }
    router.push(href);
  };

  return (
    <div className="headline-slider relative overflow-hidden rounded-xl h-[350px] lg:h-[450px]">
      <Swiper
        modules={[Autoplay]}
        autoplay={{ delay: 6000, disableOnInteraction: false }}
        loop={slides.length > 1}
        preventClicks={false}
        preventClicksPropagation={false}
        onSwiper={(swiper) => {
          swiperRef.current = swiper;
          setActiveIndex(swiper.realIndex);
        }}
        onSlideChange={(swiper) => setActiveIndex(swiper.realIndex)}
        className="h-full w-full"
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <div
              role={slide.href ? "link" : undefined}
              tabIndex={slide.href ? 0 : -1}
              onClick={slide.href ? () => handleSlideClick(slide.href) : undefined}
              onKeyDown={
                slide.href
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSlideClick(slide.href);
                      }
                    }
                  : undefined
              }
              className={cn(
                "block h-full w-full select-none",
                slide.href ? "cursor-pointer" : "cursor-default"
              )}
            >
              <div className="relative h-full w-full">
                {slide.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={slide.image_url}
                    alt={slide.title || ""}
                    className="h-full w-full object-cover pointer-events-none"
                    draggable={false}
                  />
                ) : (
                  <div className="h-full w-full bg-primary flex items-center justify-center pointer-events-none">
                    <Newspaper className="h-16 w-16 text-white/30" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
                {(slide.title || slide.subtitle) && (
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-8 lg:p-10 pb-16 sm:pb-20 pointer-events-none">
                    {slide.title && (
                      <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white tracking-tight mb-2 line-clamp-2">
                        {slide.title}
                      </h2>
                    )}
                    {slide.subtitle && (
                      <p className="text-sm sm:text-base text-white/85 max-w-2xl line-clamp-2">
                        {slide.subtitle}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {slides.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              swiperRef.current?.slidePrev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            aria-label="Önceki"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              swiperRef.current?.slideNext();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            aria-label="Sonraki"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center justify-center gap-1.5 max-w-[calc(100%-6rem)]">
            {slides.map((_, index) => {
              const isActive = index === activeIndex;
              return (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleBulletClick(index);
                  }}
                  aria-label={`${index + 1}. manşete git`}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-colors",
                    isActive
                      ? "bg-white text-primary shadow"
                      : "bg-white/30 text-white hover:bg-white/50 cursor-pointer backdrop-blur-sm"
                  )}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
