/**
 * Supabase Storage path helper'lari.
 *
 * Multi-tenant'ta her dosya {tenant_id}/{folder}/{filename} formatinda
 * yuklenir. tenant_id prefix'i RLS politikasinin tenant izolasyonunu
 * saglar ((storage.foldername(name))[1] ile parse eder).
 */

/**
 * Tenant-scoped storage path olusturur.
 *
 * @example
 * buildStoragePath("uuid-123", "news", "1234-abc.jpg")
 * // => "uuid-123/news/1234-abc.jpg"
 */
export function buildStoragePath(
  tenantId: string,
  folder: string,
  fileName: string
): string {
  // Defansif: bos veya tehlikeli input'a karsi
  if (!tenantId) {
    throw new Error("buildStoragePath: tenantId zorunlu");
  }
  if (!folder) {
    throw new Error("buildStoragePath: folder zorunlu");
  }
  if (!fileName) {
    throw new Error("buildStoragePath: fileName zorunlu");
  }

  return `${tenantId}/${folder}/${fileName}`;
}

/**
 * Random suffix'li dosya adi olusturur.
 * Mevcut deseni korur: {timestamp}-{base36-random}.{ext}
 */
export function generateFileName(originalName: string): string {
  const ext = originalName.split(".").pop() || "bin";
  return `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
}
