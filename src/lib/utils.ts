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

/**
 * HTML icerigindeki <img src="..."> adreslerini cikarir
 */
export function extractImagesFromHtml(html: string | null | undefined): string[] {
  if (!html) return [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (m[1] && !urls.includes(m[1])) urls.push(m[1]);
  }
  return urls;
}
