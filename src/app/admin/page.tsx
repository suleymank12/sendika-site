"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Newspaper,
  Megaphone,
  FileText,
  GalleryHorizontal,
  BookOpen,
  Plus,
  ArrowRight,
} from "lucide-react";
import AdminHeader from "@/components/admin/AdminHeader";
import StatusBadge from "@/components/admin/StatusBadge";
import Loading from "@/components/ui/Loading";
import { formatDate } from "@/lib/utils";
import { useSiteTitle } from "@/hooks/useSiteTitle";
import Link from "next/link";
import { cn } from "@/lib/utils";

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

const quickActions = [
  {
    label: "Yeni Haber",
    href: "/admin/haberler/yeni",
    icon: Newspaper,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
  },
  {
    label: "Yeni Duyuru",
    href: "/admin/duyurular/yeni",
    icon: Megaphone,
    iconBg: "bg-amber-50",
    iconColor: "text-amber-600",
  },
  {
    label: "Yeni Manşet",
    href: "/admin/manset",
    icon: BookOpen,
    iconBg: "bg-rose-50",
    iconColor: "text-rose-600",
  },
  {
    label: "Yeni Sayfa",
    href: "/admin/sayfalar/yeni",
    icon: FileText,
    iconBg: "bg-purple-50",
    iconColor: "text-purple-600",
  },
];

function QuickActionCard({
  label,
  href,
  icon: Icon,
  iconBg,
  iconColor,
}: (typeof quickActions)[number]) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl bg-white border border-border p-4 hover:shadow-md hover:border-primary/30 transition-all"
    >
      <div className={cn("rounded-lg p-2.5 shrink-0", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-text-dark">{label}</p>
        <p className="text-xs text-text-muted mt-0.5 flex items-center gap-1">
          Ekle
          <Plus className="h-3 w-3" />
        </p>
      </div>
      <ArrowRight className="h-4 w-4 text-text-muted group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
    </Link>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  iconBg,
  iconColor,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  iconBg: string;
  iconColor: string;
}) {
  return (
    <div className="rounded-xl bg-white p-5 border border-border">
      <div className="flex items-center gap-3">
        <div className={cn("rounded-lg p-2.5", iconBg)}>
          <Icon className={cn("h-5 w-5", iconColor)} />
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

        {/* Quick Actions */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
            Hızlı İşlemler
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action) => (
              <QuickActionCard key={action.href} {...action} />
            ))}
          </div>
        </div>

        {/* Stats */}
        <div>
          <h3 className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
            Genel Bakış
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={Newspaper}
              label="Toplam Haber"
              value={stats.news}
              iconBg="bg-blue-50"
              iconColor="text-blue-600"
            />
            <StatCard
              icon={Megaphone}
              label="Toplam Duyuru"
              value={stats.announcements}
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
            <StatCard
              icon={FileText}
              label="Toplam Sayfa"
              value={stats.pages}
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
            />
            <StatCard
              icon={GalleryHorizontal}
              label="Galeri Albümü"
              value={stats.albums}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
          </div>
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
                      className="flex-1 min-w-0 text-sm text-text-dark hover:text-primary truncate"
                    >
                      {item.title}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge published={item.is_published} />
                      <span className="text-xs text-text-muted">{formatDate(item.created_at)}</span>
                    </div>
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
                      className="flex-1 min-w-0 text-sm text-text-dark hover:text-primary truncate"
                    >
                      {item.title}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge published={item.is_published} />
                      <span className="text-xs text-text-muted">{formatDate(item.created_at)}</span>
                    </div>
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
