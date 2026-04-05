import slugifyLib from "slugify";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

/**
 * Turkce karakter destekli slug olusturma
 */
export function createSlug(text: string): string {
  return slugifyLib(text, {
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
