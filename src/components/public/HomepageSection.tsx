import Link from "next/link";
import { Building2, ChevronRight } from "lucide-react";
import * as LucideIcons from "lucide-react";
import NewsCard from "./NewsCard";
import { formatDate, truncateText } from "@/lib/utils";
import {
  HomepageSection as HomepageSectionType,
  HomepageSectionItem,
  News,
  Announcement,
} from "@/types";

function getLucideIcon(name: string | null | undefined) {
  if (!name) return null;
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string }>
  >;
  return icons[name] || null;
}

interface HomepageSectionProps {
  section: HomepageSectionType;
  items: HomepageSectionItem[];
  news: News[];
  announcements: Announcement[];
  totalItems?: number;
}

function gridClass(layout: string) {
  if (layout === "grid-8") return "grid grid-cols-2 sm:grid-cols-4 gap-4";
  return "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6";
}

function topViewAllHref(source: string): string | null {
  if (source === "news") return "/haberler";
  if (source === "announcements") return "/duyurular";
  return null;
}

export default function HomepageSection({
  section,
  items,
  news,
  announcements,
  totalItems,
}: HomepageSectionProps) {
  const topViewAll = topViewAllHref(section.source);

  const header = (
    <div className="flex items-center justify-between mb-6">
      <h2 className="text-xl font-bold text-text-dark tracking-tight">{section.title}</h2>
      {topViewAll && (
        <Link
          href={topViewAll}
          className="flex items-center gap-1 text-sm font-medium text-primary-light hover:text-primary transition-colors"
        >
          Tümünü Gör
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
    </div>
  );

  if (section.source === "news") {
    if (news.length === 0) return null;
    return (
      <section className="container mx-auto px-4 py-8">
        {header}
        <div className={gridClass(section.layout)}>
          {news.map((item) => (
            <NewsCard key={item.id} news={item} />
          ))}
        </div>
      </section>
    );
  }

  if (section.source === "announcements") {
    if (announcements.length === 0) return null;
    return (
      <section className="container mx-auto px-4 py-8">
        {header}
        <div className={gridClass(section.layout)}>
          {announcements.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} />
          ))}
        </div>
      </section>
    );
  }

  // custom
  if (items.length === 0) return null;
  const hasMore = typeof totalItems === "number" && totalItems > items.length;

  return (
    <section className="container mx-auto px-4 py-8">
      {header}
      <div className={gridClass(section.layout)}>
        {items.map((item) => (
          <CustomItemCard key={item.id} item={item} />
        ))}
      </div>
      {hasMore && (
        <div className="flex justify-end mt-4">
          <Link
            href={`/bolum/${section.id}`}
            className="flex items-center gap-1 text-sm font-medium text-primary-light hover:text-primary transition-colors"
          >
            Tümünü Gör
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}

function CustomItemCard({ item }: { item: HomepageSectionItem }) {
  const href = item.link_url || "#";
  const isExternal = /^https?:\/\//i.test(href);
  const Icon = getLucideIcon(item.icon);

  const content = (
    <div className="group rounded-lg border border-border bg-white overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 h-full flex flex-col">
      <div className="relative aspect-video bg-primary/5 overflow-hidden">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : Icon ? (
          <div className="h-full w-full flex items-center justify-center">
            <Icon className="h-10 w-10 text-primary/60" />
          </div>
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary/40" />
          </div>
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-xs text-text-muted mt-1 line-clamp-2">
            {truncateText(item.description, 120)}
          </p>
        )}
      </div>
    </div>
  );

  if (isExternal) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block h-full">
        {content}
      </a>
    );
  }

  return (
    <Link href={href} className="block h-full">
      {content}
    </Link>
  );
}

function AnnouncementCard({ announcement }: { announcement: Announcement }) {
  return (
    <Link
      href={`/duyurular/${announcement.slug}`}
      className="group block h-full rounded-lg border border-border bg-white overflow-hidden hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
    >
      <div className="relative aspect-video bg-primary/5 overflow-hidden">
        {announcement.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={announcement.cover_image}
            alt={announcement.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center">
            <Building2 className="h-10 w-10 text-primary/40" />
          </div>
        )}
      </div>
      <div className="p-3">
        <time className="text-xs text-text-muted">
          {formatDate(announcement.published_at || announcement.created_at)}
        </time>
        <h3 className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2 mt-1">
          {announcement.title}
        </h3>
      </div>
    </Link>
  );
}
