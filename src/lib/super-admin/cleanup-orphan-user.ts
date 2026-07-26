import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Helper sonucu — discriminated union ile cagiranlar tam tip guvenligi
 * altinda davranisi ayirt eder:
 *
 * - deleted: true → auth.users'tan basariyla silindi (cascade tenant_users
 *   satirlarini da gotur)
 * - deleted: false, reason "multi-tenant" → kullanici baska tenant'a bagli,
 *   silinmedi (BASARI sayilir)
 * - deleted: false, reason "super-admin" → kullanici super admin, silinmedi
 *   (BASARI sayilir)
 * - deleted: false, reason "error" → deleteUser cagrisi patladi, silinemedi
 *   (KISMI BASARI — 207 raporlanmali)
 */
export type CleanupResult =
  | { deleted: true }
  | { deleted: false; reason: "multi-tenant" | "super-admin" }
  | { deleted: false; reason: "error"; error: string };

/**
 * Bir kullanicinin auth.users kaydini, YALNIZCA bu kullanici baska bir
 * tenant'a bagli degilse VE super admin degilse temizler.
 *
 * Kullanim noktalari:
 *  - delete-tenant route'u: cascade tenant_users'i sildigi icin
 *    excludeTenantId VERILMEZ (omit). Helper saf count yapacak.
 *  - tenant-users DELETE handler'i: uyelik satiri HENUZ silinmemis
 *    durumda olabilir, "bu tenant'tan cikarsam orphan olur mu?"
 *    sorusuna cevap icin excludeTenantId GEREKLI.
 *
 * Super admin tespiti: is_super_admin RPC'si (kaynak: public.super_admins
 * tablosu, migration 022). Su anki sistemde super admin tenant_users'ta hic
 * kayitli degil ama defansif kontrol kritik — yanlislikla silinirse platform
 * kilitlenir. Kontrol FAIL-CLOSED: RPC hata verirse kullanici SILINMEZ.
 */
export async function cleanupOrphanUserIfNeeded(
  admin: SupabaseClient,
  userId: string,
  excludeTenantId?: string
): Promise<CleanupResult> {
  // 1) Diger tenant'a bagli mi? (satir cekmeden say)
  let otherTenantQuery = admin
    .from("tenant_users")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (excludeTenantId) {
    otherTenantQuery = otherTenantQuery.neq("tenant_id", excludeTenantId);
  }

  const { count: otherTenantCount, error: otherTenantError } =
    await otherTenantQuery;

  if (otherTenantError) {
    console.error(
      `[cleanup-orphan-user] user ${userId} other-tenant check hatasi:`,
      otherTenantError
    );
    return { deleted: false, reason: "error", error: otherTenantError.message };
  }

  if ((otherTenantCount || 0) > 0) {
    // Baska tenant'a da bagli, silmiyoruz (BASARI sayilir)
    return { deleted: false, reason: "multi-tenant" };
  }

  // 2) Super admin mi? TEK DOGRULUK KAYNAGI: is_super_admin RPC'si
  //    (public.super_admins tablosu — migration 022).
  //
  //    ONCEDEN burada user_metadata/app_metadata okunuyordu. user_metadata
  //    kullanicinin KENDI yazabildigi bir alan oldugu icin herhangi bir
  //    kullanici kendini "super admin" isaretleyip SILINEMEZ hale
  //    getirebiliyordu (K1 aciginin yan dali). Artik yetki, kullanicinin
  //    yazamadigi tek kaynaktan okunuyor.
  const { data: isSuperAdmin, error: superAdminCheckError } = await admin.rpc(
    "is_super_admin",
    { user_id: userId }
  );

  if (superAdminCheckError) {
    console.error(
      `[cleanup-orphan-user] user ${userId} super admin kontrolu hatasi:`,
      superAdminCheckError
    );
    // FAIL-CLOSED: super admin olup olmadigindan emin degilsek SILME.
    return {
      deleted: false,
      reason: "error",
      error: superAdminCheckError.message,
    };
  }

  if (isSuperAdmin) {
    console.warn(
      `[cleanup-orphan-user] user ${userId} super admin, silinmeyecek`
    );
    return { deleted: false, reason: "super-admin" };
  }

  // 3) Sil
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);

  if (deleteError) {
    console.error(
      `[cleanup-orphan-user] user ${userId} deleteUser hatasi:`,
      deleteError
    );
    return { deleted: false, reason: "error", error: deleteError.message };
  }

  return { deleted: true };
}
