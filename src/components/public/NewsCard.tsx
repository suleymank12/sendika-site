import Image from "next/image";
import Link from "next/link";
import { Calendar, Newspaper } from "lucide-react";
import { News } from "@/types";
import { formatDate, truncateText } from "@/lib/utils";

interface NewsCardProps {
  news: News;
}

export default function NewsCard({ news }: NewsCardProps) {
  return (
    <Link href={`/haberler/${news.slug}`} className="group block h-full">
      <article className="rounded-xl border border-border bg-white overflow-hidden hover:shadow-lg hover:-translate-y-1 transition-all duration-300 h-full flex flex-col">
        {/* Cover image */}
        <div className="relative h-52 bg-bg-light overflow-hidden">
          {news.cover_image ? (
            <Image
              src={news.cover_image}
              alt={news.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="h-full w-full flex items-center justify-center bg-primary/5">
              <Newspaper className="h-10 w-10 text-primary/30" />
            </div>
          )}
          {news.category && (
            <span className="absolute top-3 left-3 rounded-full bg-primary px-3 py-1 text-xs font-medium text-white">
              {news.category}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 p-4 flex flex-col">
          <div className="flex items-center gap-1.5 text-xs text-text-muted mb-2">
            <Calendar className="h-3.5 w-3.5" />
            <time>{formatDate(news.published_at || news.created_at)}</time>
          </div>
          <h3 className="text-base font-semibold text-text-dark group-hover:text-primary transition-colors mb-2 line-clamp-2">
            {news.title}
          </h3>
          {news.summary && (
            <p className="text-sm text-text-muted leading-relaxed flex-1 line-clamp-3">
              {truncateText(news.summary, 120)}
            </p>
          )}
          <span className="inline-block mt-auto pt-3 text-sm font-medium text-primary-light group-hover:text-primary transition-colors">
            Devamını Oku →
          </span>
        </div>
      </article>
    </Link>
  );
}
