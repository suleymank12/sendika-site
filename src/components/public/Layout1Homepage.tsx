import Link from "next/link";
import { ChevronRight } from "lucide-react";
import NewsAnnouncementSection from "@/components/public/NewsAnnouncementSection";
import NewsCard from "@/components/public/NewsCard";
import HomepageSection from "@/components/public/HomepageSection";
import {
  Headline,
  News,
  Announcement,
  Slider,
  HomepageSection as HomepageSectionType,
  HomepageSectionItem,
} from "@/types";

interface Layout1HomepageProps {
  headlines: Headline[];
  news: News[];
  announcements: Announcement[];
  sliders: Slider[];
  sections: HomepageSectionType[];
  customItemsBySection: Map<string, HomepageSectionItem[]>;
  sectionNewsPool: News[];
  sectionAnnPool: Announcement[];
}

function renderSection(
  section: HomepageSectionType,
  customItemsBySection: Map<string, HomepageSectionItem[]>,
  sectionNewsPool: News[],
  sectionAnnPool: Announcement[]
) {
  let sectionNews: News[] = [];
  let sectionAnnouncements: Announcement[] = [];
  let items: HomepageSectionItem[] = [];
  let totalItems: number | undefined;

  if (section.source === "news") {
    sectionNews = sectionNewsPool.slice(0, section.item_count);
  } else if (section.source === "announcements") {
    sectionAnnouncements = sectionAnnPool.slice(0, section.item_count);
  } else {
    const allItems = customItemsBySection.get(section.id) || [];
    items = allItems.slice(0, section.item_count);
    totalItems = allItems.length;
  }

  return (
    <HomepageSection
      key={section.id}
      section={section}
      items={items}
      news={sectionNews}
      announcements={sectionAnnouncements}
      totalItems={totalItems}
    />
  );
}

export default function Layout1Homepage({
  headlines,
  news,
  announcements,
  sliders,
  sections,
  customItemsBySection,
  sectionNewsPool,
  sectionAnnPool,
}: Layout1HomepageProps) {
  const layoutNews = news.slice(0, 4);

  // İlk custom section'ı (order=0 olan) Son Haberler'in üstüne yerleştir.
  // Başlık adı önemli değil — admin başlığı değiştirebilir, sürükle-bırak ile sıra değiştirebilir.
  const topCustomSection = sections.find((s) => s.source === "custom");
  const otherSections = sections.filter(
    (s) => !topCustomSection || s.id !== topCustomSection.id
  );

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

      {/* En üstteki custom section — Son Haberler'in üstünde */}
      {topCustomSection &&
        renderSection(
          topCustomSection,
          customItemsBySection,
          sectionNewsPool,
          sectionAnnPool
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

      {/* Diğer dinamik bölümler */}
      {otherSections.map((section) =>
        renderSection(section, customItemsBySection, sectionNewsPool, sectionAnnPool)
      )}
    </>
  );
}
