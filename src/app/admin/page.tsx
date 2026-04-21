"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Newspaper, Megaphone, FileText, GalleryHorizontal } from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import Loading from "@/components/ui/Loading";
import { formatDate } from "@/lib/utils";
import { useSiteTitle } from "@/hooks/useSiteTitle";
import Link from "next/link";

interface Stats {
  news: number;
  announcements: number;
  pages: number;
  albums: number;
}

interface RecentItem {
  id: string;
  title: string;
  created_at: string;
  is_published: boolean;
}

function StatCard({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white p-5 border border-border">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2.5">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <p className="text-2xl font-bold text-text-dark">{value}</p>
          <p className="text-sm text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ news: 0, announcements: 0, pages: 0, albums: 0 });
  const [recentNews, setRecentNews] = useState<RecentItem[]>([]);
  const [recentAnnouncements, setRecentAnnouncements] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const siteTitle = useSiteTitle();
  
  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();

      const [newsCount, annCount, pagesCount, albumsCount, newsRecent, annRecent] = await Promise.all([
        supabase.from("news").select("*", { count: "exact", head: true }),
        supabase.from("announcements").select("*", { count: "exact", head: true }),
        supabase.from("pages").select("*", { count: "exact", head: true }),
        supabase.from("gallery_albums").select("*", { count: "exact", head: true }),
        supabase.from("news").select("id, title, created_at, is_published").order("created_at", { ascending: false }).limit(5),
        supabase.from("announcements").select("id, title, created_at, is_published").order("created_at", { ascending: false }).limit(5),
      ]);

      setStats({
        news: newsCount.count || 0,
        announcements: annCount.count || 0,
        pages: pagesCount.count || 0,
        albums: albumsCount.count || 0,
      });
      setRecentNews(newsRecent.data || []);
      setRecentAnnouncements(annRecent.data || []);
      setLoading(false);
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <>
        <AdminHeader title="Dashboard" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title="Dashboard" />
      <div className="p-4 lg:p-6 space-y-6">
        {/* Welcome */}
        <div className="rounded-xl bg-primary p-6 text-white">
          <h2 className="text-xl font-bold">Hoş Geldiniz!</h2>
          <p className="text-white/70 text-sm mt-1">{siteTitle} Yönetim Paneli</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Newspaper} label="Toplam Haber" value={stats.news} />
          <StatCard icon={Megaphone} label="Toplam Duyuru" value={stats.announcements} />
          <StatCard icon={FileText} label="Toplam Sayfa" value={stats.pages} />
          <StatCard icon={GalleryHorizontal} label="Galeri Albümü" value={stats.albums} />
        </div>

        {/* Recent items */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent News */}
          <div className="rounded-xl bg-white border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-dark">Son Haberler</h3>
              <Link href="/admin/haberler" className="text-sm text-primary-light hover:text-primary">
                Tümünü Gör
              </Link>
            </div>
            {recentNews.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">Henüz haber eklenmemiş.</p>
            ) : (
              <ul className="space-y-3">
                {recentNews.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/haberler/${item.id}`}
                      className="text-sm text-text-dark hover:text-primary truncate"
                    >
                      {item.title}
                    </Link>
                    <span className="text-xs text-text-muted shrink-0">{formatDate(item.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent Announcements */}
          <div className="rounded-xl bg-white border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-text-dark">Son Duyurular</h3>
              <Link href="/admin/duyurular" className="text-sm text-primary-light hover:text-primary">
                Tümünü Gör
              </Link>
            </div>
            {recentAnnouncements.length === 0 ? (
              <p className="text-sm text-text-muted py-4 text-center">Henüz duyuru eklenmemiş.</p>
            ) : (
              <ul className="space-y-3">
                {recentAnnouncements.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3">
                    <Link
                      href={`/admin/duyurular/${item.id}`}
                      className="text-sm text-text-dark hover:text-primary truncate"
                    >
                      {item.title}
                    </Link>
                    <span className="text-xs text-text-muted shrink-0">{formatDate(item.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
