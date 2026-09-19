"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";
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
import SetupGuide from "@/components/admin/SetupGuide";
import StatusBadge from "@/components/admin/StatusBadge";
import ListLoadError from "@/components/admin/ListLoadError";
import Loading from "@/components/ui/Loading";
import { formatDate } from "@/lib/utils";
import { useSiteTitle } from "@/hooks/useSiteTitle";
import {
  SETUP_GUIDE_DISMISSED_KEY,
  SETUP_GUIDE_SETTING_KEYS,
  evaluateSetupGuide,
  type SetupGuideResult,
} from "@/lib/setup-guide";
import Link from "next/link";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

/**
 * Sayaçlar: `null` = O SORGU HATA VERDİ (sıfır DEĞİL).
 *
 * Eskiden `count || 0` yazılıyordu, yani patlayan sorgu ekranda "0" olarak
 * görünüyordu — sahte ama normal duran bir ekran. Başlangıç Adımları bu
 * sayaçlardan beslendiği için o hata artık sahte "adım açık" da üretirdi
 * ("haberiniz yok" derken aslında sorgu patlamış olurdu).
 */
interface Stats {
  news: number | null;
  announcements: number | null;
  pages: number | null;
  albums: number | null;
}

interface RecentItem {
  id: string;
  title: string;
  created_at: string;
  is_published: boolean;
}

/** Supabase sayım cevabının okuduğumuz kadarı (yapısal tip — import yok). */
type CountResponse = { count: number | null; error: { message: string } | null };

/** Hata → null; başarı → sayı (sayı gelmediyse 0). */
function readCount(res: CountResponse): number | null {
  return res.error ? null : (res.count ?? 0);
}

const EMPTY_STATS: Stats = { news: null, announcements: null, pages: null, albums: null };

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
  value: number | null;
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
          {/* Okunamayan sayaç "0" DEĞİL "—": sıfır bir bilgidir, hata değil. */}
          <p className="text-2xl font-bold text-text-dark">
            {value === null ? (
              <span className="text-text-muted" title="Okunamadı">
                —
              </span>
            ) : (
              value
            )}
          </p>
          <p className="text-sm text-text-muted">{label}</p>
        </div>
      </div>
    </div>
  );
}

/** Son eklenenler kartı. `items === null` = liste okunamadı (boş DEĞİL). */
function RecentCard({
  title,
  href,
  items,
  itemHref,
  emptyText,
  onRetry,
}: {
  title: string;
  href: string;
  items: RecentItem[] | null;
  itemHref: (id: string) => string;
  emptyText: string;
  onRetry: () => void;
}) {
  return (
    <div className="rounded-xl bg-white border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-text-dark">{title}</h3>
        <Link href={href} className="text-sm text-primary-light hover:text-primary">
          Tümünü Gör
        </Link>
      </div>
      {items === null ? (
        // Hata durumunda "Henüz ... eklenmemiş" ASLA gösterilmez — kayıtları
        // silinmiş sanan admin paniği (ListLoadError'ın var olma nedeni).
        <ListLoadError onRetry={onRetry} className="p-5" />
      ) : items.length === 0 ? (
        <p className="text-sm text-text-muted py-4 text-center">{emptyText}</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3">
              <Link
                href={itemHref(item.id)}
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
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>(EMPTY_STATS);
  const [recentNews, setRecentNews] = useState<RecentItem[] | null>([]);
  const [recentAnnouncements, setRecentAnnouncements] = useState<RecentItem[] | null>([]);
  const [guide, setGuide] = useState<SetupGuideResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const [dismissing, setDismissing] = useState(false);
  const siteTitle = useSiteTitle();
  const { tenant } = useTenant();

  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;

    const fetchData = async () => {
      const supabase = createClient();

      // TEK DALGA — 12 sorgu, hepsi birbirinden bağımsız (b2 dersi:
      // seri round-trip = gecikme). Başlangıç Adımları için 6 sorgu EKLENDİ
      // ama derinlik 1'de kaldı; hepsi indeksli tenant_id üzerinde
      // head-count olduğu için dalganın süresi (= max) pratikte değişmiyor.
      //
      // Haber/duyuru sayısı için YENİ sorgu açılmadı: zaten çekilen toplam
      // sayaçlar kullanılıyor. "Yayında mı" değil "hiç var mı" ölçülüyor —
      // bilinçli: taslak yazmış admin Haberler ekranını zaten bulmuştur.
      const [
        newsCount,
        annCount,
        pagesCount,
        albumsCount,
        newsRecent,
        annRecent,
        settingsRes,
        categoriesCount,
        menuCount,
        sectionsCount,
        headlinesCount,
        slidersCount,
      ] = await Promise.all([
        supabase.from("news").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("announcements").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("pages").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("gallery_albums").select("*", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("news").select("id, title, created_at, is_published").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("announcements").select("id, title, created_at, is_published").eq("tenant_id", tenant.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("site_settings").select("key, value").eq("tenant_id", tenant.id).in("key", [...SETUP_GUIDE_SETTING_KEYS]),
        supabase.from("news_categories").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        supabase.from("menu_items").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
        // is_active filtresi BİLİNÇLİ (süper admin listesi filtresiz sayar):
        // pasif bölüm/manşet/kapak görseli ziyaretçiye görünmüyor, public
        // anasayfa da aynı filtreyi uyguluyor.
        supabase.from("homepage_sections").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
        supabase.from("headlines").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
        supabase.from("sliders").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id).eq("is_active", true),
      ]);

      if (cancelled) return;

      const nextStats: Stats = {
        news: readCount(newsCount),
        announcements: readCount(annCount),
        pages: readCount(pagesCount),
        albums: readCount(albumsCount),
      };
      setStats(nextStats);
      setRecentNews(newsRecent.error ? null : ((newsRecent.data as RecentItem[]) ?? []));
      setRecentAnnouncements(annRecent.error ? null : ((annRecent.data as RecentItem[]) ?? []));

      const settings = settingsRes.error
        ? null
        : Object.fromEntries(
            ((settingsRes.data as { key: string; value: string | null }[]) ?? []).map((r) => [
              r.key,
              r.value,
            ])
          );

      setGuide(
        evaluateSetupGuide({
          settings,
          tenantLogoUrl: tenant.logo_url ?? null,
          counts: {
            menuItems: readCount(menuCount),
            categories: readCount(categoriesCount),
            news: nextStats.news,
            announcements: nextStats.announcements,
            headlines: readCount(headlinesCount),
            sliders: readCount(slidersCount),
            homepageSections: readCount(sectionsCount),
            galleryAlbums: nextStats.albums,
          },
        })
      );
      setLoading(false);
    };

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [tenant, retryKey]);

  /**
   * Rehberi gizle / geri getir. Tercih site_settings'te (kuruluş kararı) —
   * gerekçe lib/setup-guide.ts → SETUP_GUIDE_DISMISSED_KEY.
   */
  const setDismissed = useCallback(
    async (value: boolean) => {
      if (!tenant) return;
      setDismissing(true);
      const supabase = createClient();
      const { error } = await supabase.from("site_settings").upsert(
        {
          tenant_id: tenant.id,
          key: SETUP_GUIDE_DISMISSED_KEY,
          value: value ? "true" : "false",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,key" }
      );
      setDismissing(false);
      if (error) {
        console.error("[Özet] rehber tercihi kaydedilemedi:", error);
        toast.error("Kaydetme başarısız oldu.");
        return;
      }
      // Okunamayan hal de tercihi taşır — gizlenmiş rehber, sorgu hatasında
      // da susmalı (bkz. lib/setup-guide.ts → SetupGuideResult).
      setGuide((prev) => {
        if (!prev) return prev;
        return prev.readable
          ? { ...prev, dismissed: value }
          : { readable: false, dismissed: value };
      });
      if (value) toast.success("Başlangıç adımları gizlendi.");
    },
    [tenant]
  );

  const retry = useCallback(() => {
    setLoading(true);
    setRetryKey((k) => k + 1);
  }, []);

  if (loading) {
    return (
      <>
        <AdminHeader title="Özet" helpTopic="dashboard" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title="Özet" helpTopic="dashboard" />
      <div className="p-4 lg:p-6 space-y-6">
        {/* Welcome */}
        <div className="rounded-xl bg-primary p-6 text-white">
          <h2 className="text-xl font-bold">Hoş Geldiniz!</h2>
          <p className="text-white/70 text-sm mt-1">{siteTitle} Yönetim Paneli</p>
        </div>

        {/* Başlangıç Adımları — banner'ın ALTINDA (teşhis turu A seçeneği):
            banner bilgi taşımıyor ama "doğru yerdeyim" hissi veriyor ve
            kalıcı; rehber geçici. */}
        {guide && (
          <SetupGuide
            result={guide}
            onDismiss={() => setDismissed(true)}
            dismissing={dismissing}
          />
        )}

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
          <RecentCard
            title="Son Haberler"
            href="/admin/haberler"
            items={recentNews}
            itemHref={(id) => `/admin/haberler/${id}`}
            emptyText="Henüz haber eklenmemiş."
            onRetry={retry}
          />
          <RecentCard
            title="Son Duyurular"
            href="/admin/duyurular"
            items={recentAnnouncements}
            itemHref={(id) => `/admin/duyurular/${id}`}
            emptyText="Henüz duyuru eklenmemiş."
            onRetry={retry}
          />
        </div>

        {/* Gizlenmiş rehberin geri kapısı — kalıcı kapatma bir şeyi
            ULAŞILMAZ kılmamalı. */}
        {guide?.dismissed && (
          <div className="text-center">
            <button
              type="button"
              onClick={() => setDismissed(false)}
              disabled={dismissing}
              className="text-xs text-text-muted underline underline-offset-2 transition-colors hover:text-text-dark disabled:opacity-50"
            >
              Kurulum rehberini göster
            </button>
          </div>
        )}
      </div>
    </>
  );
}
