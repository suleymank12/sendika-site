import { createClient } from "@/lib/supabase/server";
import HeroSlider from "@/components/public/HeroSlider";
import NewsCard from "@/components/public/NewsCard";
import AnnouncementList from "@/components/public/AnnouncementList";
import QuickAccessGrid from "@/components/public/QuickAccessGrid";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
export default async function HomePage() {
  const supabase = createClient();

  const [slidersRes, newsRes, announcementsRes, quickAccessRes] = await Promise.all([
    supabase.from("sliders").select("*").eq("is_active", true).order("order", { ascending: true }),
    supabase.from("news").select("*").eq("is_published", true).order("published_at", { ascending: false }).limit(6),
    supabase.from("announcements").select("*").eq("is_published", true).order("published_at", { ascending: false }).limit(6),
    supabase.from("quick_access").select("*").eq("is_active", true).order("order", { ascending: true }),
  ]);

  const sliders = slidersRes.data || [];
  const news = newsRes.data || [];
  const announcements = announcementsRes.data || [];
  const quickAccess = quickAccessRes.data || [];

  return (
    <>
      {/* Hero Slider */}
      <HeroSlider slides={sliders} />

      {/* Quick Access */}
      {quickAccess.length > 0 && (
        <section className="container mx-auto px-4 py-16">
          <QuickAccessGrid items={quickAccess} />
        </section>
      )}

      {/* Latest News */}
      <section className="container mx-auto px-4 py-16">
        <div className="flex items-center justify-between mb-8">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {news.map((item) => (
              <NewsCard key={item.id} news={item} />
            ))}
          </div>
        )}
      </section>

      {/* Announcements */}
      <section className="bg-bg-light">
        <div className="container mx-auto px-4 py-16">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-2xl font-bold text-text-dark tracking-tight">Duyurular</h2>
            <Link
              href="/duyurular"
              className="flex items-center gap-1 text-sm font-medium text-primary-light hover:text-primary transition-colors"
            >
              Tümünü Gör
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          {announcements.length === 0 ? (
            <p className="text-text-muted text-sm">Henüz duyuru bulunmuyor.</p>
          ) : (
            <div className="rounded-xl bg-white border border-border p-6">
              <AnnouncementList announcements={announcements} />
            </div>
          )}
        </div>
      </section>
    </>
  );
}
