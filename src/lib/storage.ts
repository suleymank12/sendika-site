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

// ===========================================================================
// Storage temizligi (Sprint 3.6 — yetim dosya .remove())
// ===========================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helper sonucu — discriminated union.
 * - removed:true, count → tam basari
 * - removed:true, partial:true → bazi dosyalar silinemedi (log)
 * - removed:false, reason:"no-files" → bos array (cagri yapilmadi)
 * - removed:false, reason:"all-failed" → remove cagrisi patladi
 */
export type StorageRemovalResult =
  | { removed: true; count: number }
  | { removed: true; partial: true; count: number; failed: string[] }
  | { removed: false; reason: "no-files" }
  | { removed: false; reason: "all-failed"; error: string };

/**
 * Bir Supabase storage public URL'inden bucket-goreli path'i cikarir.
 *
 * Ornek:
 *   Input:  "https://xyz.supabase.co/storage/v1/object/public/images/abc-123/news/cover.jpg"
 *   Output: "abc-123/news/cover.jpg" (bucket="images" icin)
 *
 * Parse: "/storage/v1/object/public/{bucket}/" sonrasini al. Bizim DB'miz
 * getPublicUrl ciktisini (tam public URL) tutar; .remove() ise bucket-goreli
 * path bekler — bu util ikisi arasini koprular.
 *
 * @param publicUrl - Tam public URL (getPublicUrl ciktisi)
 * @param bucket - Bucket adi (default "images")
 * @returns Path veya null (parse edilemezse / bos ise)
 */
export function storagePathFromUrl(
  publicUrl: string | null | undefined,
  bucket: string = "images"
): string | null {
  if (!publicUrl || typeof publicUrl !== "string") {
    return null;
  }

  const marker = `/storage/v1/object/public/${bucket}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) {
    return null;
  }

  // Marker sonrasini al, query string varsa kaldir (defansif)
  const pathPart = publicUrl.substring(idx + marker.length);
  const queryIdx = pathPart.indexOf("?");
  const cleanPath = queryIdx === -1 ? pathPart : pathPart.substring(0, queryIdx);

  return cleanPath || null;
}

/**
 * Supabase storage'tan dosyalari siler (best-effort, idempotent).
 *
 * Tek bucket cagrisi ile N dosya siler. Zaten silinmis dosyalar sessiz
 * gecer (Supabase remove davranisi). Hata durumunda DB silme islemini
 * ETKILEMEZ — cagiran fonksiyon DB silmeyi onceden yapar; storage temizligi
 * best-effort tamamlayicidir, kritik path degildir.
 *
 * @param supabase - Client (browser veya server, fark etmez)
 * @param bucket - Bucket adi (orn. "images")
 * @param paths - Bucket-goreli path'ler (storagePathFromUrl ciktisi); null'lar elenir
 */
export async function removeFilesFromStorage(
  supabase: SupabaseClient,
  bucket: string,
  paths: (string | null)[]
): Promise<StorageRemovalResult> {
  const validPaths = paths.filter((p): p is string => !!p);

  if (validPaths.length === 0) {
    return { removed: false, reason: "no-files" };
  }

  const { data, error } = await supabase.storage.from(bucket).remove(validPaths);

  if (error) {
    console.error(
      `[storage-cleanup] bucket ${bucket} remove hatasi (${validPaths.length} dosya):`,
      error
    );
    return { removed: false, reason: "all-failed", error: error.message };
  }

  const removedCount = data?.length || 0;

  if (removedCount === validPaths.length) {
    return { removed: true, count: removedCount };
  }

  // Kismi basari: bazi dosyalar silinemedi (zaten yoktu veya yetki yok)
  const removedNames = new Set((data || []).map((d) => d.name));
  const failed = validPaths.filter((p) => !removedNames.has(p));

  console.warn(
    `[storage-cleanup] kismi basari: ${removedCount}/${validPaths.length} silindi, kalanlar:`,
    failed
  );

  return { removed: true, partial: true, count: removedCount, failed };
}

/**
 * Bir entity'nin (haber/duyuru/sayfa/manset) content_media satirlarini siler ve
 * silinen satirlarin storage path'lerini dondurur.
 *
 * NEDEN ELLE SILME: content_media.content_id'de FK YOK (polimorfik:
 * content_type+content_id). Haber/duyuru/sayfa silindiginde content_media
 * satirlari cascade GITMEZ — bu yuzden bu helper elle siliyor. (Tek cascade
 * tenant_id → tenants; entity silmede devreye girmez.)
 *
 * Cagiran: removeFilesFromStorage(supabase, "images", [coverPath, ...returnedPaths])
 * ile storage temizligini tek cagrida yapar.
 *
 * Idempotent: content_media bos veya yoksa bos array doner, hata vermez.
 *
 * @param supabase - Client
 * @param tenantId - Tenant ID (tenant-aware)
 * @param contentType - "news" | "announcement" | "page" | "headline"
 * @param contentId - Entity ID
 * @returns Silinen content_media satirlarinin storage path'leri (null'lar elenmis)
 */
export async function purgeContentMedia(
  supabase: SupabaseClient,
  tenantId: string,
  contentType: "news" | "announcement" | "page" | "headline",
  contentId: string
): Promise<string[]> {
  // 1) Url'leri topla (silmeden ONCE)
  const { data: mediaRows, error: fetchError } = await supabase
    .from("content_media")
    .select("url")
    .eq("tenant_id", tenantId)
    .eq("content_type", contentType)
    .eq("content_id", contentId);

  if (fetchError) {
    console.error(
      `[purge-content-media] ${contentType}/${contentId} fetch hatasi:`,
      fetchError
    );
    return [];
  }

  if (!mediaRows || mediaRows.length === 0) {
    return [];
  }

  // 2) Storage path'lere cevir (null'lari ele)
  const paths = mediaRows
    .map((row) => storagePathFromUrl(row.url))
    .filter((p): p is string => !!p);

  // 3) content_media satirlarini ELLE sil (cascade yok)
  const { error: deleteError } = await supabase
    .from("content_media")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("content_type", contentType)
    .eq("content_id", contentId);

  if (deleteError) {
    console.error(
      `[purge-content-media] ${contentType}/${contentId} silme hatasi:`,
      deleteError
    );
    // DB silme patladi ama path listesini yine de dondur — storage temizligi
    // yine de yarar saglar (best-effort).
    return paths;
  }

  return paths;
}
