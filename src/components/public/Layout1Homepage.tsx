import Link from "next/link";
import { ChevronRight, Building2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import NewsAnnouncementSection from "@/components/public/NewsAnnouncementSection";
import NewsCard from "@/components/public/NewsCard";
import HomepageSection from "@/components/public/HomepageSection";
import {
  Headline,
  News,
  Announcement,
  QuickAccess,
  Slider,
  HomepageSection as HomepageSectionType,
  HomepageSectionItem,
} from "@/types";

function getLucideIcon(name: string | null | undefined) {
  if (!name) return null;
  const icons = LucideIcons as unknown as Record<
    string,
    React.ComponentType<{ className?: string }>
  >;
  return icons[name] || null;
}

interface Layout1HomepageProps {
  headlines: Headline[];
  news: News[];
  announcements: Announcement[];
  quickAccess: QuickAccess[];
  hasMoreQuickAccess: boolean;
  sliders: Slider[];
  sections: HomepageSectionType[];
  customItemsBySection: Map<string, HomepageSectionItem[]>;
  sectionNewsPool: News[];
  sectionAnnPool: Announcement[];
}

export default function Layout1Homepage({
  headlines,
  news,
  announcements,
  quickAccess,
  hasMoreQuickAccess,
  sliders,
  sections,
  customItemsBySection,
  sectionNewsPool,
  sectionAnnPool,
}: Layout1HomepageProps) {
  const layoutNews = news.slice(0, 4);

  return (
    <>
      {/* Manşet + Duyuru/Haber */}
      <section className="container mx-auto px-4 pt-4">
        <NewsAnnouncementSection
          headlines={headlines}
          sliders={sliders}
          news={news}
          announcements={announcements}
        />
      </section>

      {/* 8 Kutucuk — Hızlı Erişim */}
      {quickAccess.length > 0 && (
        <section className="container mx-auto px-4 py-8">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {quickAccess.map((item) => (
              <QuickAccessTile key={item.id} item={item} />
            ))}
          </div>
          {hasMoreQuickAccess && (
            <div className="flex justify-end mt-4">
              <Link
                href="/hizli-erisim"
                className="flex items-center gap-1 text-sm font-medium text-primary-light hover:text-primary transition-colors"
              >
                Tümünü Gör
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Son Haberler */}
      <section className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-text-dark tracking-tight">
            Son Haberler
          </h2>
          <Link
            href="/haberler"
            className="flex items-center gap-1 text-sm font-medium text-primary-light hover:text-primary transition-colors"
          >
            Tümünü Gör
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {layoutNews.length === 0 ? (
          <p className="text-text-muted text-sm">Henüz haber bulunmuyor.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {layoutNews.map((item) => (
              <div key={item.id} className="h-full">
                <NewsCard news={item} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dinamik bölümler */}
      {sections.map((section) => {
        let sectionNews: News[] = [];
        let sectionAnnouncements: Announcement[] = [];
        let items: HomepageSectionItem[] = [];

        if (section.source === "news") {
          sectionNews = sectionNewsPool.slice(0, section.item_count);
        } else if (section.source === "announcements") {
          sectionAnnouncements = sectionAnnPool.slice(0, section.item_count);
        } else {
          items = (customItemsBySection.get(section.id) || []).slice(
            0,
            section.item_count
          );
        }

        return (
          <HomepageSection
            key={section.id}
            section={section}
            items={items}
            news={sectionNews}
            announcements={sectionAnnouncements}
          />
        );
      })}
    </>
  );
}

function QuickAccessTile({ item }: { item: QuickAccess }) {
  const Icon = getLucideIcon(item.icon);
  const href = item.slug ? `/hizli-erisim/${item.slug}` : item.url || "#";

  return (
    <Link
      href={href}
      className="group rounded-xl border border-border bg-white overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
    >
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
      <div className="p-3 text-center">
        <span className="text-sm font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2">
          {item.title}
        </span>
      </div>
    </Link>
  );
}
