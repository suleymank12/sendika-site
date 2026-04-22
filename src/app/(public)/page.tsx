import { createClient } from "@/lib/supabase/server";
import Layout1Homepage from "@/components/public/Layout1Homepage";
import Layout2Homepage from "@/components/public/Layout2Homepage";
import {
  Headline,
  News,
  Announcement,
  QuickAccess,
  Slider,
  HomepageSection as HomepageSectionType,
  HomepageSectionItem,
} from "@/types";

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
      .limit(6),
    supabase
      .from("announcements")
      .select("*")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(8),
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
    needsExtraNews && maxNewsCount > news.length
      ? supabase
          .from("news")
          .select("*")
          .eq("is_published", true)
          .order("published_at", { ascending: false })
          .limit(maxNewsCount)
      : Promise.resolve({ data: null }),
    needsExtraAnnouncements && maxAnnCount > announcements.length
      ? supabase
          .from("announcements")
          .select("*")
          .eq("is_published", true)
          .order("published_at", { ascending: false })
          .limit(Math.max(maxAnnCount, announcements.length))
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

  if (layoutType === "layout2") {
    return <Layout2Homepage {...layoutProps} />;
  }

  return <Layout1Homepage {...layoutProps} />;
}
