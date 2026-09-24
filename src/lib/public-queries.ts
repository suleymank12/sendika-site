import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { hataVarsaFirlat } from "@/lib/veri-hatasi";
import type {
  News,
  Announcement,
  Page,
  GalleryAlbum,
  Headline,
  HomepageSection,
  Branch,
  BoardMember,
} from "@/types";

/**
 * PUBLIC DETAY SAYFALARININ ORTAK KAYIT OKUYUCULARI (b2).
 *
 * NEDEN VAR (b2 teshisi, 18 Eylul 2026): dokuz public detay sayfasinin
 * HEPSI ayni satiri IKI kez cekiyordu — bir kez `generateMetadata`'da hafif
 * kolonlarla, bir kez sayfada `select("*")` ile. Kolon listeleri farkli
 * oldugu icin kendiliginden dedupe de olmuyordu.
 *
 * React `cache()` = ISTEK-ICI memoizasyon. Ayni HTTP isteginde
 * generateMetadata + sayfa ayni argumanlarla cagirinca DB'ye TEK sorgu
 * gider. (`getSiteSettings` ve `getCurrentTenant` zaten bu desende.)
 *
 * ⚠️ GECIKMEYE etkisi YOK — olculdu: Next 14.2.35'te generateMetadata ile
 * sayfa PARALEL calisiyor (layout 1200 ms + page 600 ms = 1.271 ms, sirali
 * olsaydi 1.800 ms). Bu modulun kazanci istek basina 9 gereksiz sorgunun
 * kalkmasi: Supabase kotasi, DB yuku, bant genisligi. En belirgini
 * `pages` — `content` (tam HTML govdesi) iki kez tasiniyordu.
 *
 * 🔴 ISTEMCI SECIMI KASITLI, DEGISTIRMEYIN:
 *   - anon client (`createPublicClient`, oturumsuz — C5) → RLS uyguluyor. `is_published` gibi
 *     filtreleri RLS tasiyorsa service-role'e tasimak YAYINLANMAMIS
 *     icerigi acar. (Anasayfadaki ayni uyariya bakin.)
 *   - admin client (`createAdminClient`) → 026'da public SELECT policy'leri
 *     DROP edilen tablolar icin; tenant izolasyonu ve aktiflik ELLE
 *     `.eq("tenant_id")` / `.eq("is_active", true)` ile saglaniyor.
 * Her fonksiyonun ustunde hangisini kullandigi yaziyor; cagiran sayfayla
 * AYNI olmak zorunda.
 *
 * `.maybeSingle()` tercih edildi: 0 satir = `data: null, error: null` →
 * cagiran 404 verir (davranis AYNI).
 *
 * 🔴 HATA ≠ YOK (C7, 24 Eylul 2026): sorgu HATASI artik yutulmuyor —
 * `return (data as X) || hataVarsaFirlat(error, "…")` → kayit varsa kayit,
 * yoksa hata FIRLAR (notr 500), hata da yoksa null (404). Eskiden hata da
 * null'a dusup 404 veriyordu (kesintide detay sayfalari dizinden duserdi).
 */

/** anon client — `is_published` filtresini RLS ile birlikte tasir. */
export const getNewsBySlug = cache(
  async (tenantId: string, slug: string): Promise<News | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    return (data as News) || hataVarsaFirlat(error, "haber detayi");
  }
);

/** anon client. */
export const getAnnouncementBySlug = cache(
  async (tenantId: string, slug: string): Promise<Announcement | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    return (data as Announcement) || hataVarsaFirlat(error, "duyuru detayi");
  }
);

/** anon client. */
export const getPageBySlug = cache(
  async (tenantId: string, slug: string): Promise<Page | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("pages")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    return (data as Page) || hataVarsaFirlat(error, "sayfa detayi");
  }
);

/**
 * anon client. `gallery_images(count)` gomulu sayim BILEREK burada:
 * generateMetadata aciklama metninde ("… — N fotograf") kullaniyor, sayfa
 * yok sayiyor. Ayri sorgu acmamak icin tek select'te tasiniyor.
 */
export type GalleryAlbumWithCount = GalleryAlbum & {
  gallery_images?: { count: number }[];
};

export const getGalleryAlbumById = cache(
  async (tenantId: string, albumId: string): Promise<GalleryAlbumWithCount | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("gallery_albums")
      .select("*, gallery_images(count)")
      .eq("tenant_id", tenantId)
      .eq("id", albumId)
      .eq("is_published", true)
      .maybeSingle();
    return (data as unknown as GalleryAlbumWithCount) || hataVarsaFirlat(error, "galeri albumu");
  }
);

/**
 * anon client. `is_active` filtresi YOK — pasif mansetlere direkt URL ile
 * erisilebilsin (mevcut davranis korunuyor).
 *
 * Sorgu hatasi FIRLAR (C7); eskiden `{ headline, error }` donup sayfada
 * loglaniyor ve 404'e dusuyordu.
 */
export const getHeadlineById = cache(
  async (
    tenantId: string,
    id: string
  ): Promise<Headline | null> => {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("headlines")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .maybeSingle();
    return (data as Headline) || hataVarsaFirlat(error, "manset detayi");
  }
);

/** admin client (RLS bypass) — homepage_* public policy'leri 026'da DROP edildi. */
export const getHomepageSectionById = cache(
  async (tenantId: string, id: string): Promise<HomepageSection | null> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("homepage_sections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();
    return (data as HomepageSection) || hataVarsaFirlat(error, "anasayfa bolumu");
  }
);

/**
 * admin client (RLS bypass). IKI rota paylasiyor: `subeler/[slug]` ve
 * `subeler/[slug]/yonetici` — ikisinde de generateMetadata + sayfa.
 */
export const getBranchBySlug = cache(
  async (tenantId: string, slug: string): Promise<Branch | null> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("branches")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    return (data as Branch) || hataVarsaFirlat(error, "sube detayi");
  }
);

/** admin client (RLS bypass). */
export const getBoardMemberBySlug = cache(
  async (tenantId: string, slug: string): Promise<BoardMember | null> => {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("board_members")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    return (data as BoardMember) || hataVarsaFirlat(error, "yonetim kurulu uyesi");
  }
);
