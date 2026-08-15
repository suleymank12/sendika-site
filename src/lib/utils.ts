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
 * HTML icerikten duz metin ozeti cikarir (meta description icin).
 * Server-safe: DOM yok, regex ile tag atma + yaygin entity cozme +
 * bosluk normalizasyonu. Sonuc maxLength'te kesilir; bos/tagsiz icerik
 * icin "" doner (cagiran taraf `|| undefined` ile fallback'e dusurur).
 */
export function extractTextFromHtml(
  html: string | null | undefined,
  maxLength = 160
): string {
  if (!html) return "";
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return truncateText(text, maxLength);
}

// UYARI: Bu kural middleware.ts CSP frame-src ile SENKRON olmali. Orayi
//  degistirirsen burayi da guncelle — yoksa dogrulayicinin kabul ettigi
//  URL'i CSP bloklar ve kullanici sebebini anlayamaz.
/**
 * Verilen adresin sube haritasi <iframe src>'ine GUVENLE verilebilecegini
 * soyler. map_url tenant admin girdisidir; dogrulanmadan iframe'e verilirse
 * public sayfaya rastgele site gomulebilir (phishing) ve javascript: semasi
 * XSS vektoru olur.
 *
 * Kabul edilen TEK kaynak Google Maps embed URL'leri:
 *   - https://www.google.com/maps/embed?pb=...    ("Haritayi yerlestir")
 *   - https://www.google.com/maps/embed/v1/...    (Maps Embed API)
 *   - https://www.google.com/maps?...&output=embed (eski embed modu;
 *     adresten uretilen fallback da bu bicim)
 *
 * Hostname TAM eslesir ("www.google.com.evil.com" gibi suffix hileleri
 * gecmez). /maps/place gibi sayfalar BILEREK reddedilir: Google onlari
 * frame'lemeyi reddeder, iframe'de gri "refused to connect" kutusu cikar.
 *
 * ASLA throw etmez — ayristirilamayan girdi icin false doner.
 */
export function isSafeMapEmbedUrl(url: string | null | undefined): url is string {
  const value = (url || "").trim();
  if (!value) return false;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.hostname !== "www.google.com") {
      return false;
    }
    if (parsed.pathname.startsWith("/maps/embed")) return true;
    return parsed.pathname === "/maps" && parsed.searchParams.get("output") === "embed";
  } catch {
    return false;
  }
}

/**
 * Admin formu icin harita girdisi normalizasyonu. Google'in "Haritayi
 * yerlestir" diyalogu iframe kodunun TAMAMINI kopyalatir; en olasi kullanici
 * hatasi onu aynen yapistirmak. Girdi iframe HTML'i ise icinden src cikarilir
 * ve ayni kati kuraldan (isSafeMapEmbedUrl) gecirilir. Gecmeyen her sey null.
 *
 * SADECE yazma yolunda (admin form) kullanilmali — render tarafi kurtarma
 * yapmaz, sadece dogrular (bkz. buildMapEmbed). Boylece DB'de her zaman
 * temiz URL durur.
 */
export function normalizeMapEmbedInput(raw: string | null | undefined): string | null {
  const value = (raw || "").trim();
  if (!value) return null;

  const iframeSrc = value.match(/<iframe[^>]+src=["']([^"']+)["']/i);
  // Markup gorunumlu ama iframe src'si cikmayan girdi URL olarak DENENMEZ.
  const candidate = iframeSrc ? iframeSrc[1] : value.startsWith("<") ? null : value;

  return isSafeMapEmbedUrl(candidate) ? candidate : null;
}

/**
 * Gevsek e-posta bicim kontrolu (admin formlari). Bos degeri cagiran
 * ele alir; burasi yalnizca dolu degerin kabaca adres olup olmadigina
 * bakar. Kati RFC dogrulamasi BILEREK yok — gecerli adresi reddetmek,
 * bicimsiz adresi kabul etmekten pahali.
 */
export function isValidEmail(value: string): boolean {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

/**
 * Pratik URL normalizasyonu (admin girdileri): kullanici "www.ornek.com"
 * yazabilsin. http(s), site ici path/anchor ve mailto/tel oldugu gibi
 * gecer; geri kalan her sey https:// onekiyle mutlak URL'ye cevrilir (bu
 * ayni zamanda javascript: gibi semalari da etkisizlestirir). Bos girdi
 * "" doner. Kullanim: RichTextEditor link modali + admin link/sosyal
 * medya alanlarinin KAYDETME yolu (sessiz duzeltme, hata mesaji yok).
 */
export function normalizeExternalUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || /^[/#]/.test(url) || /^(mailto|tel):/i.test(url)) {
    return url;
  }
  return `https://${url}`;
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
