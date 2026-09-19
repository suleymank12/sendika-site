/**
 * PANEL ERİŞİM KARARI — saf fonksiyon (20 Eylül 2026).
 *
 * ## Neden ayrı dosya
 *
 * Karar eskiden `admin/(authenticated)/layout.tsx` içine gömülüydü ve iki
 * ayrı durum AYNI ekrana çıkıyordu:
 *
 *     if (memberError) redirect("/admin/yetkisiz");   // ← geçici DB hatası
 *     if (!membership) redirect("/admin/yetkisiz");   // ← gerçek yetkisizlik
 *
 * Yani Supabase bir anlığına hata dönse kullanıcıya "bu kurumda yetkiniz
 * yok" deniyordu — yanlış ve moral bozucu bir cümle; üstelik "tekrar dene"
 * yolu da yoktu. Karar buraya çıkarıldı: hem üç dal testle kilitlendi
 * (`scripts/test-admin-access.mjs`) hem de layout okunur hâle geldi.
 *
 * ## 🔴 FAIL-CLOSED KORUNUYOR
 *
 * Hata durumunda panele **SOKULMAZ**. Değişen tek şey, kapının hangi
 * yazıyla kapandığı: "yetkin yok" yerine "geçici sorun, tekrar dene".
 * Erişim kararı hiçbir dalda gevşemedi.
 *
 * Bu dosya bilerek **import'suz**: test betiği doğrudan çalıştırabilsin.
 */

/** Kararın okuduğu en küçük kullanıcı şekli. */
export interface AdminAccessUser {
  id: string;
}

/** Kararın okuduğu en küçük kurum şekli. */
export interface AdminAccessTenant {
  id: string;
  is_active: boolean;
}

/** `tenant_users` satırı (varlığı yeterli). */
export interface AdminAccessMembership {
  id: string;
}

export interface AdminAccessInput {
  /** Doğrulanmış kullanıcı; oturum yoksa null. */
  user: AdminAccessUser | null;
  /** Host'tan çözülen kurum; çözülemediyse null. */
  tenant: AdminAccessTenant | null;
  /** Üyelik satırı; yoksa null. */
  membership: AdminAccessMembership | null;
  /** Üyelik sorgusu hata verdiyse hata; vermediyse null. */
  membershipError: { message?: string } | null;
}

export type AdminAccessDecision =
  /** Oturum yok → giriş sayfası. */
  | { kind: "giris" }
  /** Host bir kuruma çözülemedi → "kurum bulunamadı" ekranı. */
  | { kind: "kurum-yok" }
  /** Kurum pasif → "panel kapalı" ekranı. */
  | { kind: "kurum-pasif" }
  /** Üyelik SORGUSU hata verdi → "geçici sorun" ekranı (panele SOKMAZ). */
  | { kind: "gecici-hata" }
  /** Üyelik yok → yetkisiz ekranı. */
  | { kind: "yetkisiz" }
  /** Her şey yolunda → panel. */
  | { kind: "izin" };

/**
 * Sıra ÖNEMLİ ve bilinçli:
 *
 *  1. `user` yok      → giriş. (Kimlik olmadan kurumu tartışmanın anlamı yok.)
 *  2. `tenant` yok    → kurum bulunamadı. (Fail-closed; üst layout da aynısını
 *     yapıyor, burası savunma derinliği.)
 *  3. kurum pasif     → panel kapalı. Süper admin dahil herkese kapalı.
 *  4. sorgu HATASI    → geçici hata. 🔴 `!membership` kontrolünden ÖNCE:
 *     hata varsa `membership` zaten null gelir ve "yetkisiz" demek
 *     YANLIŞ olurdu. Bu sıra, düzeltilen bug'ın ta kendisi.
 *  5. üyelik yok      → yetkisiz.
 *  6. aksi halde      → izin.
 */
export function decideAdminAccess(input: AdminAccessInput): AdminAccessDecision {
  if (!input.user) return { kind: "giris" };
  if (!input.tenant) return { kind: "kurum-yok" };
  if (!input.tenant.is_active) return { kind: "kurum-pasif" };
  if (input.membershipError) return { kind: "gecici-hata" };
  if (!input.membership) return { kind: "yetkisiz" };
  return { kind: "izin" };
}
