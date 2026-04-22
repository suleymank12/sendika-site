import Link from "next/link";
import { Building2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
import FullWidthSlider from "@/components/public/FullWidthSlider";
import NewsAnnouncementSection from "@/components/public/NewsAnnouncementSection";
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

interface Layout2HomepageProps {
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

export default function Layout2Homepage({
  headlines,
  news,
  announcements,
  quickAccess,
  sliders,
  sections,
  customItemsBySection,
  sectionNewsPool,
  sectionAnnPool,
}: Layout2HomepageProps) {
  const tiles = quickAccess.slice(0, 8);

  return (
    <>
      {/* A) Navbar + Manşet birleşik (FullWidthSlider, navbar absolute üstüne biniyor) */}
      <FullWidthSlider headlines={headlines} fallbackSliders={sliders} />

      {/* B) Ana Grid */}
      <section className="max-w-[1400px] mx-auto py-6 px-6 lg:px-8">
        <div className="space-y-3 lg:space-y-0 lg:grid lg:grid-cols-[3fr_1fr_1fr_1fr_1fr] lg:grid-rows-2 lg:gap-3 lg:min-h-[500px]">
          {/* Haber/Duyuru — sol, 2 satır boyunca */}
          <div className="lg:row-span-2 lg:col-span-1">
            <NewsAnnouncementSection
              headlines={headlines}
              sliders={sliders}
              news={news}
              announcements={announcements}
              variant="compact"
            />
          </div>

          {/* Kutucuklar — mobil/md'de ayrı grid, lg'de parent grid'e katılır */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 lg:contents">
            {tiles.map((item) => (
              <QuickAccessBox key={item.id} item={item} />
            ))}
          </div>
        </div>
      </section>

      {/* C) Dinamik bölümler */}
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

function QuickAccessBox({ item }: { item: QuickAccess }) {
  const Icon = getLucideIcon(item.icon);
  const href = item.slug ? `/hizli-erisim/${item.slug}` : item.url || "#";

  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center bg-white border border-gray-200 rounded-lg p-6 lg:p-8 text-center min-h-[180px] hover:shadow-lg transition"
    >
      <div className="w-14 h-14 mb-3 flex items-center justify-center">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.title}
            className="h-14 w-14 object-contain"
          />
        ) : Icon ? (
          <Icon className="h-12 w-12 text-primary" />
        ) : (
          <Building2 className="h-12 w-12 text-primary/60" />
        )}
      </div>
      <span className="text-base font-medium text-text-dark group-hover:text-primary transition-colors line-clamp-2">
        {item.title}
      </span>
    </Link>
  );
}
