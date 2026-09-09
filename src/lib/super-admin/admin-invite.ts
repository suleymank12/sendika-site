/**
 * Tenant'a admin ekleme — "bu e-postaya ne göndermeliyim?" kararı.
 *
 * 8 Eylül 2026 CANLI BUG (regresyon kaydı):
 *   Süper admin panelden bir tenant'a admin eklerken, e-posta Supabase
 *   Auth'ta ZATEN KAYITLIYSA hiçbir mail gitmiyor ama panel "eklendi /
 *   davet gönderildi" diyor. Sebep: her iki route da daveti
 *   `if (!userId) { ... }` bloğunun İÇİNDE gönderiyordu — kullanıcı varsa
 *   blok atlanıyor, `inviteUserByEmail` HİÇ çağrılmıyordu. Hata yutulmuyordu;
 *   çağrı hiç yapılmıyordu. Panel de sonucu sormadan sabit "davet gönderildi"
 *   mesajı basıyordu. Davet edilen kişi hiçbir şey almıyor, süper admin
 *   gönderildiğini sanıyordu.
 *
 * 9 Eylül 2026 — canlı Supabase'te (custom SMTP / Resend) taze adreslerle
 * ÖLÇÜLDÜ, tahmin değil:
 *
 *   | Auth durumu                          | inviteUserByEmail | mail       |
 *   |--------------------------------------|-------------------|------------|
 *   | kayıt yok                            | başarılı          | GELDİ      |
 *   | kayıtlı, daveti hiç kabul etmemiş    | başarılı          | GELDİ      |
 *   | kayıtlı, şifresini belirlemiş/girmiş | 422 email_exists  | (yok)      |
 *
 *   Ayrıca: `generateLink()` link üretir ama MAIL GÖNDERMEZ (taze adrese
 *   hiçbir şey ulaşmadı) — "davet gönderiliyor" sanılıp kullanılamaz.
 *   `resetPasswordForEmail` onaylanmamış kullanıcıda bile mail gönderiyor,
 *   yani 2. dal için alternatifti; ancak yeniden davet ölçümle çalıştığı için
 *   akış tek çağrıda (inviteUserByEmail) tutuldu — kişi "davet" bekliyor,
 *   "şifre sıfırlama" değil.
 *
 * AYIRICI ALAN — neden `last_sign_in_at`:
 *   Ölçüm gösteriyor ki daveti asıl reddettiren alan `email_confirmed_at`.
 *   Bu uygulamada ikisi birlikte dolar: davet linkine tıklamak
 *   `davet-kabul` sayfasında `setSession` çağırır, bu da hem e-postayı
 *   onaylar hem `last_sign_in_at`'i yazar. `last_sign_in_at` kullanıcıya
 *   anlatılabilir tek alan ("giriş yapmış mı?"), mesajlar da onun üstüne
 *   kurulu. Yine de 3. dalda davet çağrısı YAPILIR ve hatası raporlanır —
 *   yani ayırıcı yanılsa bile sonuç sessiz kalmaz, "invite_failed" döner.
 */

/**
 * Kararın okuduğu tek alan. `AuthUserSummary` (lib/supabase/admin-helpers)
 * bu şekli yapısal olarak karşılar — bu modül bilerek importsuz tutuldu ki
 * test betiği (scripts/test-tenant-user-add.mjs) doğrudan çalıştırabilsin.
 */
export interface ExistingAuthUser {
  last_sign_in_at: string | null;
}

/** API cevabındaki `outcome` alanı — panel mesajı buna göre seçer. */
export type AdminInviteOutcome =
  /** Auth'ta kayıt yoktu: kullanıcı oluşturuldu, davet gitti. */
  | "invited"
  /** Kayıt vardı ama daveti hiç kabul etmemişti: davet yeniden gönderildi. */
  | "reinvited"
  /** Kayıt vardı ve giriş yapmış: sadece bağlandı, MAİL GÖNDERİLMEDİ. */
  | "linked_existing"
  /** Bağlandı fakat davet çağrısı hata verdi (kısmi başarı — 207). */
  | "invite_failed";

export type AdminInviteAction =
  | { kind: "invite"; outcome: "invited" }
  | { kind: "reinvite"; outcome: "reinvited" }
  | { kind: "link_only"; outcome: "linked_existing" };

/**
 * Auth kaydının durumuna göre ne yapılacağını söyler. Saf fonksiyon:
 * ağ yok, yan etki yok — üç dalın tamamı testte kilitli.
 *
 * - `null` (kayıt yok)      → invite    (kullanıcıyı oluşturur + davet yollar)
 * - giriş yapmamış          → reinvite  (aynı çağrı; daveti yeniden yollar)
 * - giriş yapmış            → link_only (davet REDDEDİLİR, çağırma)
 */
export function decideAdminInviteAction(
  existingUser: ExistingAuthUser | null
): AdminInviteAction {
  if (!existingUser) {
    return { kind: "invite", outcome: "invited" };
  }
  if (existingUser.last_sign_in_at) {
    return { kind: "link_only", outcome: "linked_existing" };
  }
  return { kind: "reinvite", outcome: "reinvited" };
}

/**
 * Süper admin'e gösterilecek mesajlar. Teknik terim yok; okuyan kişi
 * "şimdi ne olacak / karşı tarafa ne söylemeliyim" sorusunu cevaplayabilmeli.
 */
export const ADMIN_INVITE_MESSAGES: Record<AdminInviteOutcome, string> = {
  invited: "Davet gönderildi.",
  reinvited:
    "Bu kişi sistemde kayıtlıydı ama daveti hiç kabul etmemiş. Davet yeniden gönderildi.",
  linked_existing:
    "Bu kişi sistemde zaten kayıtlı. Mevcut şifresiyle girebilir — davet maili gönderilmedi.",
  invite_failed:
    "Kullanıcı kuruma bağlandı fakat davet maili gönderilemedi. Tekrar deneyin veya kişiye \"Şifremi unuttum\" adımını kullanmasını söyleyin.",
};

/**
 * Davet linkinin döneceği adres.
 *
 * Production'da `NEXT_PUBLIC_SITE_URL` kullanılır (tenant subdomain'i değil:
 * davet kabulü tek adreste toplanır, `davet-kabul` kişiyi sonra doğru
 * kuruma yollar). Değişken tanımsızsa eskiden string'e
 * "undefined/admin/davet-kabul" yazılıyordu — Supabase böyle bir redirect'i
 * izin listesinde bulamayıp sessizce proje Site URL'ine düşerdi. Artık
 * tanımsızsa `undefined` döner: aynı fallback, ama bozuk URL üretmeden ve
 * sunucu log'una düşen açık bir uyarıyla.
 */
export function buildInviteRedirectUrl(tenantSlug: string): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return `http://${tenantSlug}.lvh.me:3000/admin/davet-kabul`;
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    console.error(
      "[admin-invite] NEXT_PUBLIC_SITE_URL tanımsız — davet linki Supabase " +
        "proje Site URL'ine düşecek. Ortam değişkenini tanımlayın " +
        "(bkz. .env.local.example)."
    );
    return undefined;
  }

  return `${siteUrl.replace(/\/+$/, "")}/admin/davet-kabul`;
}
