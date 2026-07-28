import slugifyLib from "slugify";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

const TR_CHAR_MAP: Record<string, string> = {
  ç: "c", Ç: "c",
  ğ: "g", Ğ: "g",
  ı: "i", İ: "i", I: "i",
  ö: "o", Ö: "o",
  ş: "s", Ş: "s",
  ü: "u", Ü: "u",
};

/**
 * Turkce karakter destekli slug olusturma
 * Turkce karakterler ASCII'ye donusturulur, sonra slugify uygulanir
 */
export function createSlug(text: string): string {
  const asciified = text.replace(/[çÇğĞıİIöÖşŞüÜ]/g, (ch) => TR_CHAR_MAP[ch] || ch);
  return slugifyLib(asciified, {
    lower: true,
    strict: true,
    locale: "tr",
    trim: true,
  });
}

/**
 * Turkce tarih formati: "1 Ocak 2026"
 */
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "d MMMM yyyy", { locale: tr });
}

/**
 * Metni belirli uzunlukta kes
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + "...";
}

/**
 * Tailwind class birlestirme
 */
export function cn(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(" ");
}

const NEXT_IMAGE_HOST_RE = /^[a-z0-9-]+\.supabase\.co$/i;
const NEXT_IMAGE_PATH_PREFIX = "/storage/v1/object/public/";

// UYARI: Bu kural next.config.mjs images.remotePatterns ile SENKRON
//  olmalı. Orayı değiştirirsen burayı da güncelle — yoksa geçerli
//  görsel sessizce kaybolur ya da geçersiz src sayfayı çökertir.
/**
 * Verilen adresin next/image'a GUVENLE verilebilecegini soyler.
 *
 * next/image, tanimadigi bir src ile render sirasinda HATA FIRLATIR ve
 * sayfayi 500'e dusurur ("Failed to parse src", "hostname is not configured").
 * Bu yuzden bozuk/yabanci veri buraya hic ulasmamali. Ikinci savunma katmani:
 * sanitize kaynagi temizler, bu fonksiyon da tuketim tarafini korur.
 *
 * ASLA throw etmez — ayristirilamayan girdi icin false doner.
 *
 * Type predicate: true donduğunde cagiran tarafta tip `string`e daralir,
 * boylece SafeImage gibi tuketiciler ekstra non-null assertion'a ihtiyac
 * duymaz.
 */
export function isNextImageSafeUrl(url: string | null | undefined): url is string {
  const value = (url || "").trim();
  if (!value) return false;

  // Site-goreli: TEK egik cizgi ("//host/x" protokol-gorelidir, reddedilir).
  if (value.startsWith("/")) return !value.startsWith("//");

  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      NEXT_IMAGE_HOST_RE.test(parsed.hostname) &&
      parsed.pathname.startsWith(NEXT_IMAGE_PATH_PREFIX)
    );
  } catch {
    return false;
  }
}

/**
 * HTML icerigindeki <img src="..."> adreslerini cikarir.
 * next/image'a verilemeyecek adresler SESSIZCE atlanir (bkz. isNextImageSafeUrl).
 */
export function extractImagesFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (src && isNextImageSafeUrl(src) && !urls.includes(src)) urls.push(src);
  }
  return urls;
}

/**
 * Tenant'in admin paneline cross-subdomain URL insa eder.
 * Development: subdomain.lvh.me:3000/admin
 * Production: custom_domain varsa onu, yoksa subdomain.{apex}/admin
 */
export function buildTenantAdminUrl(
  slug: string,
  customDomain?: string | null
): string {
  if (typeof window === "undefined") return "#";

  // Custom domain varsa onu kullan (production'da oncelik)
  if (customDomain) {
    return `https://${customDomain}/admin`;
  }

  const host = window.location.host;
  const protocol = window.location.protocol;

  // Development: lvh.me veya localhost
  if (host.includes("lvh.me") || host.includes("localhost")) {
    const port = host.split(":")[1] || "3000";
    return `${protocol}//${slug}.lvh.me:${port}/admin`;
  }

  // Production: ana domain'i cikar (parts.slice(-2).join("."))
  const parts = host.split(".");
  const apex = parts.slice(-2).join(".");
  return `${protocol}//${slug}.${apex}/admin`;
}
