import { createClient } from "@/lib/supabase/server";
import HeadlineSlider from "@/components/public/HeadlineSlider";
import NewsAnnouncementTabs from "@/components/public/NewsAnnouncementTabs";
import NewsCard from "@/components/public/NewsCard";
import HomepageSection from "@/components/public/HomepageSection";
import Link from "next/link";
import { ChevronRight, Building2 } from "lucide-react";
import * as LucideIcons from "lucide-react";
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
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[name] || null;
}

export default async function HomePage() {
  const supabase = createClient();

  const [
    headlinesRes,
    newsRes,
    announcementsRes,
    quickAccessRes,
    slidersRes,
    settingsRes,
    sectionsRes,
  ] = await Promise.all([
    supabase
      .from("headlines")
      .select("*")
      .eq("is_active", true)
      .order("order", { ascending: true }),
    supabase
      .from("news")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(4),
    supabase
      .from("announcements")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(6),
    supabase
      .from("quick_access")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("order", { ascending: true })
      .limit(9),
    supabase
      .from("sliders")
      .select("*")
      .eq("is_active", true)
      .order("order", { ascending: true }),
    supabase.from("site_settings").select("key, value").eq("key", "layout_type").maybeSingle(),
    supabase
      .from("homepage_sections")
      .select("*")
      .eq("is_active", true)
      .order("order", { ascending: true }),
  ]);

  const rawHeadlines = (headlinesRes.data as Headline[]) || [];

  // Haber/duyuru kaynaklı manşetlerin slug'larını topla
  const newsIds = rawHeadlines
    .filter((h) => h.source_type === "news" && h.source_id)
    .map((h) => h.source_id as string);
  const announcementIds = rawHeadlines
    .filter((h) => h.source_type === "announcement" && h.source_id)
    .map((h) => h.source_id as string);

  const [newsSlugsRes, annSlugsRes] = await Promise.all([
    newsIds.length > 0
      ? supabase.from("news").select("id, slug").in("id", newsIds)
      : Promise.resolve({ data: [] as { id: string; slug: string }[] }),
    announcementIds.length > 0
      ? supabase.from("announcements").select("id, slug").in("id", announcementIds)
      : Promise.resolve({ data: [] as { id: string; slug: string }[] }),
  ]);

  const slugMap = new Map<string, string>();
  (newsSlugsRes.data || []).forEach((r) => slugMap.set(`news:${r.id}`, r.slug));
  (annSlugsRes.data || []).forEach((r) => slugMap.set(`announcement:${r.id}`, r.slug));

  const headlines: Headline[] = rawHeadlines.map((h) => ({
    ...h,
    source_slug:
      h.source_type && h.source_id
        ? slugMap.get(`${h.source_type}:${h.source_id}`) || null
        : null,
  }));

  const news = (newsRes.data as News[]) || [];
  const announcements = (announcementsRes.data as Announcement[]) || [];
  const quickAccessAll = (quickAccessRes.data as QuickAccess[]) || [];
  const quickAccess = quickAccessAll.slice(0, 8);
  const quickAccessTotal = quickAccessRes.count ?? quickAccessAll.length;
  const sliders = (slidersRes.data as Slider[]) || [];
  const layoutType = (settingsRes.data?.value as string) || "layout1";

  const sections = ((sectionsRes?.data as HomepageSectionType[]) || []).filter((s) =>
    ["custom", "news", "announcements"].includes(s.source)
  );

  const customSectionIds = sections.filter((s) => s.source === "custom").map((s) => s.id);
  const needsExtraNews = sections.some((s) => s.source === "news");
  const needsExtraAnnouncements = sections.some((s) => s.source === "announcements");
  const maxNewsCount = Math.max(
    ...sections.filter((s) => s.source === "news").map((s) => s.item_count),
    0
  );
  const maxAnnCount = Math.max(
    ...sections.filter((s) => s.source === "announcements").map((s) => s.item_count),
    0
  );

  const [customItemsRes, extraNewsRes, extraAnnRes] = await Promise.all([
    customSectionIds.length > 0
      ? supabase
          .from("homepage_section_items")
          .select("*")
          .in("section_id", customSectionIds)
          .eq("is_active", true)
          .order("order", { ascending: true })
      : Promise.resolve({ data: [] as HomepageSectionItem[] }),
    needsExtraNews && maxNewsCount > 4
      ? supabase
          .from("news")
          .select("*")
          .eq("is_published", true)
          .order("published_at", { ascending: false })
          .limit(maxNewsCount)
      : Promise.resolve({ data: null }),
    needsExtraAnnouncements
      ? supabase
          .from("announcements")
          .select("*")
          .eq("is_published", true)
          .order("published_at", { ascending: false })
          .limit(Math.max(maxAnnCount, 6))
      : Promise.resolve({ data: null }),
  ]);

  const customItemsBySection = new Map<string, HomepageSectionItem[]>();
  ((customItemsRes.data as HomepageSectionItem[]) || []).forEach((item) => {
    const arr = customItemsBySection.get(item.section_id) || [];
    arr.push(item);
    customItemsBySection.set(item.section_id, arr);
  });

  const sectionNewsPool: News[] = (extraNewsRes.data as News[]) || news;
  const sectionAnnPool: Announcement[] = (extraAnnRes.data as Announcement[]) || announcements;

  const layoutProps = {
    headlines,
    news,
    announcements,
    quickAccess,
    hasMoreQuickAccess: quickAccessTotal > 8,
    sliders,
    sections,
    customItemsBySection,
    sectionNewsPool,
    sectionAnnPool,
  };

  if (layoutType === "layout1") {
    return <Layout1 {...layoutProps} />;
  }

  // Layout 2 ve diğerleri ileride burada eklenecek — şimdilik Layout 1'e fallback
  return <Layout1 {...layoutProps} />;
}

function Layout1({
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
}: {
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
}) {
  return (
    <>
      {/* Manşet + Duyuru/Haber */}
      <section className="container mx-auto px-4 pt-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-0">
          <div className="lg:col-span-2 lg:pr-4">
            <HeadlineSlider headlines={headlines} fallbackSliders={sliders} />
          </div>
          <div className="lg:col-span-1">
            <NewsAnnouncementTabs news={news} announcements={announcements} />
          </div>
        </div>
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
          <h2 className="text-2xl font-bold text-text-dark tracking-tight">Son Haberler</h2>
          <Link
            href="/haberler"
            className="flex items-center gap-1 text-sm font-medium text-primary-light hover:text-primary transition-colors"
          >
            Tümünü Gör
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {news.length === 0 ? (
          <p className="text-text-muted text-sm">Henüz haber bulunmuyor.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
            {news.map((item) => (
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
          items = (customItemsBySection.get(section.id) || []).slice(0, section.item_count);
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
