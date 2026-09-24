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

// ===========================================================================
// OTURUM ve SUPER ADMIN KARARLARI (Supabase kesinti dayanikliligi C8,
// 24 Eylul 2026) — "gecici hata ≠ yetkisiz / giris".
// ===========================================================================
//
// Eskiden: admin layout'u getUser TASIMA hatasinda `/admin/giris`'e
// yonlendiriyordu (kismi kesintide middleware basariliyken giris sayfasi
// kullaniciyi geri yolluyor → dongu riski); super admin layout'u ve API'si
// `is_super_admin` rpc HATASINI "yetkiniz yok" (ekran / 403) sayiyordu.
// Hepsi FAIL-CLOSED kalir: gecici hata ekraninda panel acilmaz, API 503.
//
// Bu modul saf tutulur (testte dogrudan Node ile yuklenir, baska modul
// iceri almaz); tasima sinifi `tasimaHatasiMi` ile disaridan verilir —
// uretimde `lib/supabase/cookie-sanitize` `isTransportAuthError`.

/** `auth.getUser()` hatasinin kararin okudugu en kucuk sekli. */
export interface OturumHatasi {
  name?: string;
  status?: number;
}

export type OturumKarari =
  /** Kullanici dogrulandi. */
  | "var"
  /** Oturum yok ya da kullanilamaz (4xx) → giris sayfasi. */
  | "giris"
  /** Supabase'e ulasilamadi → gecici sorun ekrani / 503 (GIRIS SAYILMAZ). */
  | "gecici-hata";

/**
 * Sira bilincli: TASIMA hatasi `user` null olsa bile ONCE ele alinir —
 * "Supabase'e ulasamadim"i "oturumun yok" diye okumak kullaniciyi girise
 * atar (ve kismi kesintide dongu yaratir).
 */
export function decideOturum(
  girdi: { user: AdminAccessUser | null; authError: OturumHatasi | null | undefined },
  tasimaHatasiMi: (hata: OturumHatasi) => boolean
): OturumKarari {
  if (girdi.authError && tasimaHatasiMi(girdi.authError)) return "gecici-hata";
  if (girdi.authError || !girdi.user) return "giris";
  return "var";
}

export type SuperAdminAccessDecision =
  | { kind: "giris" }
  /** Oturum ya da `is_super_admin` DOGRULANAMADI → gecici sorun (panel/API KAPALI). */
  | { kind: "gecici-hata" }
  /** rpc basariyla `false`/bos dondu → gercek yetkisizlik (AYNEN). */
  | { kind: "yetkisiz" }
  | { kind: "izin" };

export function decideSuperAdminAccess(
  girdi: {
    user: AdminAccessUser | null;
    authError: OturumHatasi | null | undefined;
    isSuperAdmin: unknown;
    rpcError: { message?: string } | null | undefined;
  },
  tasimaHatasiMi: (hata: OturumHatasi) => boolean
): SuperAdminAccessDecision {
  const oturum = decideOturum(girdi, tasimaHatasiMi);
  if (oturum === "gecici-hata") return { kind: "gecici-hata" };
  if (oturum === "giris") return { kind: "giris" };
  // rpc HATASI yetkisizlikten ONCE: hata varsa `isSuperAdmin` anlamsizdir.
  if (girdi.rpcError) return { kind: "gecici-hata" };
  if (girdi.isSuperAdmin !== true) return { kind: "yetkisiz" };
  return { kind: "izin" };
}
