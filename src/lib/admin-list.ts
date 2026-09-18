/**
 * Admin liste sayfalamasinin SAF mantigi (b1).
 *
 * React'ten bagimsiz tutuldu ki `scripts/test-admin-list.mjs` ile dogrudan
 * test edilebilsin — `useAdminList.tsx` bunlari yalnizca cagirir. Sinir
 * durumlar (cop sayfa parametresi, son satir silindiginde sayfa tasmasi)
 * burada tek yerde tanimli.
 */

/** URL'deki sayfa parametresi. Public tarafla AYNI ad — `(public)/haberler/page.tsx`. */
export const PAGE_PARAM = "sayfa";

/**
 * URL'den gelen ham degeri gecerli bir sayfa numarasina cevirir.
 *
 * Kullanici adres cubuguna ne yazarsa yazsin liste patlamamali:
 * null / "" / "abc" / "0" / "-5" / "1.9" -> 1
 */
export function parsePageParam(raw: string | null | undefined): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Sayfa baglantisini kurar. Mevcut diger query parametreleri KORUNUR,
 * 1. sayfada `?sayfa` tamamen DUSER (temiz adres — public tarafin deseni).
 */
export function buildListHref(
  pathname: string,
  searchParamsString: string,
  targetPage: number
): string {
  const params = new URLSearchParams(searchParamsString);
  if (targetPage <= 1) params.delete(PAGE_PARAM);
  else params.set(PAGE_PARAM, String(targetPage));
  const qs = params.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

/** Toplam kayit ve sayfa boyutundan son gecerli sayfa. Bos listede 1. */
export function lastPage(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1;
  return Math.max(1, Math.ceil(Math.max(0, total) / pageSize));
}

/**
 * Sayfa tasmasi kontrolu: bulunulan sayfa artik yoksa inilecek sayfayi
 * dondurur, sorun yoksa `null`.
 *
 * NEDEN: sayfanin SON satiri silindiginde ya da `?sayfa=999` yazildiginda
 * kullanici bos tabloya bakmamali. Donen deger her zaman `page`'ten KUCUK
 * oldugu icin yonlendirme dongusu olusmaz.
 */
export function pageOverflowTarget(
  page: number,
  total: number,
  pageSize: number
): number | null {
  const son = lastPage(total, pageSize);
  return page > son ? son : null;
}

/** Supabase `.range(from, to)` sinirlari (her iki uc dahil). */
export function rangeFor(
  page: number,
  pageSize: number
): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
