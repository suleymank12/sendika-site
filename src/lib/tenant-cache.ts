/**
 * TENANT CACHE ETIKETLERI — saf mantik (b3).
 *
 * React/Next bagimsiz tutuldu ki `scripts/test-tenant-cache.mjs` ile dogrudan
 * test edilebilsin. `revalidateTag` cagrilarinin DOGRU etiketi uretmesi bu
 * dosyanin sorumlulugu; Next'in cache makinesi test edilmiyor, **karar**
 * ediliyor.
 *
 * NEDEN AYRI DOSYA: en kolay unutulan hata `slug DEGISTIGINDE eski etiketi
 * temizlememek`. O zaman eski slug'in cache'i TTL boyunca (60 sn) ayakta
 * kalir ve o adres hala eski kaydi gosterir. `tenantTagsForUpdate` tam olarak
 * bunu cozuyor ve testi var.
 */

export const TENANT_TAG_PREFIX = "tenant";

/**
 * Slug normalizasyonu — etiket uretiminin TEK yeri.
 *
 * `x-tenant-slug` zaten `parseHostname` tarafindan kucuk harfe cevrilmis
 * gelir, ama `update-tenant` govdeden gelen slug'i kendi normalize ediyor
 * (`slug.trim().toLowerCase()`). Iki taraf ayni kurali kullanmazsa
 * `revalidateTag` isabet etmez — bu yuzden normalizasyon burada tekillestirildi.
 */
function normalizeSlug(slug: string): string {
  return typeof slug === "string" ? slug.trim().toLowerCase() : "";
}

/**
 * Bir tenant'in cache etiketi. Bos/gecersiz slug'da `null` doner —
 * cagiran taraf `revalidateTag` cagirmamali (bos etiket hicbir seyi
 * gecersizlestirmez, sessizce yanlis guven verir).
 */
export function tenantTag(slug: string): string | null {
  const normalized = normalizeSlug(slug);
  if (!normalized) return null;
  return `${TENANT_TAG_PREFIX}:${normalized}`;
}

/**
 * Tenant guncellemesinde temizlenecek TUM etiketler.
 *
 * Slug degismediyse tek etiket; degistiyse **ESKI VE YENI** — eski adresin
 * cache'i de dusmeli. Sirasi onemli degil, tekrar edenler elenir.
 */
export function tenantTagsForUpdate(
  oldSlug: string,
  newSlug: string
): string[] {
  const tags = [tenantTag(oldSlug), tenantTag(newSlug)].filter(
    (t): t is string => t !== null
  );
  return Array.from(new Set(tags));
}
