"use client";

import { useRef } from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import { Autoplay, Pagination } from "swiper/modules";
import type { Swiper as SwiperType } from "swiper";
import "swiper/css";
import "swiper/css/pagination";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Slider } from "@/types";

interface HeroSliderProps {
  slides: Slider[];
}

export default function HeroSlider({ slides }: HeroSliderProps) {
  const swiperRef = useRef<SwiperType | null>(null);

  if (slides.length === 0) {
    return (
      <div className="relative h-[300px] sm:h-[400px] lg:h-[500px] bg-primary flex items-center justify-center">
        <div className="text-center text-white">
          <h2 className="text-3xl font-bold">Sendika Adı</h2>
          <p className="mt-2 text-white/70">Kurumsal Web Sitesi</p>
        </div>
      </div>
    );
  }

  return (
    <div className="hero-slider relative overflow-hidden">
      <Swiper
        modules={[Autoplay, Pagination]}
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        pagination={{ clickable: true }}
        loop={slides.length > 1}
        onSwiper={(swiper) => { swiperRef.current = swiper; }}
        className="h-[300px] sm:h-[400px] lg:h-[500px]"
      >
        {slides.map((slide) => (
          <SwiperSlide key={slide.id}>
            <div className="relative h-full w-full">
              <img
                src={slide.image_url}
                alt={slide.title || ""}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
              {(slide.title || slide.subtitle) && (
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-10 lg:p-16">
                  <div className="container mx-auto">
                    {slide.title && (
                      <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
                        {slide.title}
                      </h2>
                    )}
                    {slide.subtitle && (
                      <p className="text-sm sm:text-base text-white/80 max-w-2xl">
                        {slide.subtitle}
                      </p>
                    )}
                    {slide.link_url && (
                      <Link
                        href={slide.link_url}
                        className="inline-block mt-4 rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-primary hover:bg-white/90 transition-colors"
                      >
                        Devamını Oku
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>
          </SwiperSlide>
        ))}
      </Swiper>

      {/* Custom navigation arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={() => swiperRef.current?.slidePrev()}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            aria-label="Önceki"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={() => swiperRef.current?.slideNext()}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/60 transition-colors"
            aria-label="Sonraki"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}
