import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * findUserByEmail dönüş tipi.
 *
 * `last_sign_in_at` ve `invited_at`, "bu kişiye ne göndermeliyim?" kararının
 * girdisidir (bkz. api/super-admin/tenant-users, create-tenant):
 * - `last_sign_in_at` DOLU → kişi şifresini belirlemiş, en az bir kez girmiş.
 *   Yeni davet gönderilemez (inviteUserByEmail zaten kayıtlı e-postada hata
 *   döndürür) ve gönderilmemeli — mevcut şifresi geçerli.
 * - `last_sign_in_at` NULL → hesap var ama hiç kullanılmamış (eski davet
 *   süresi dolmuş, mail ulaşmamış, kişi hiç tıklamamış). Şifre belirleme
 *   bağlantısı gönderilmeli.
 * `invited_at` yalnızca teşhis/log içindir: hesabın davetle mi yoksa başka
 *   yolla mı (signUp, admin createUser) doğduğunu ayırt eder.
 */
export interface AuthUserSummary {
  id: string;
  email: string;
  /** Kişi en az bir kez giriş yaptıysa ISO tarih, aksi halde null. */
  last_sign_in_at: string | null;
  /** Hesap inviteUserByEmail ile oluşturulduysa ISO tarih, aksi halde null. */
  invited_at: string | null;
}

/**
 * Email'e göre Supabase Auth user'ı bulur.
 * supabase-js v2.101'de getUserByEmail tipte/runtime'da yok, listUsers ile pagination yapıyoruz.
 * Email büyük/küçük harf duyarsız karşılaştırılır.
 */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<AuthUserSummary | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) {
      return {
        id: found.id,
        email: found.email ?? "",
        last_sign_in_at: found.last_sign_in_at ?? null,
        invited_at: found.invited_at ?? null,
      };
    }

    if (users.length < perPage) return null; // son sayfa
    page += 1;

    // Güvenlik: sonsuz döngü koruması (çok büyük platformlarda makul üst sınır)
    if (page > 50) throw new Error("findUserByEmail: pagination limiti aşıldı (50 sayfa)");
  }
}

/**
 * Verilen user id'lerin e-postalarını döndürür (id → email).
 *
 * NEDEN VAR: `listUsers()` parametresiz çağrıldığında YALNIZCA ilk sayfayı
 * (varsayılan 50 kayıt) döndürür. tenant-users/list bunu yapıyordu; platformda
 * 50'den fazla kullanıcı olduğunda sonraki sayfalarda kalan adminler panelde
 * e-postasız ("(e-posta yok)") görünüyordu. Sayfalama findUserByEmail ile
 * aynı desende: perPage 1000, son sayfa tespiti, 50 sayfa üst sınırı.
 *
 * Aranan id'lerin hepsi bulununca kalan sayfalar çekilmez.
 */
export async function getUserEmailsByIds(
  admin: SupabaseClient,
  userIds: string[]
): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  if (userIds.length === 0) return emails;

  const missing = new Set(userIds);
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    for (const u of users) {
      if (missing.has(u.id)) {
        emails.set(u.id, u.email ?? "");
        missing.delete(u.id);
      }
    }

    if (missing.size === 0) return emails; // hepsi bulundu, erken çık
    if (users.length < perPage) return emails; // son sayfa
    page += 1;

    if (page > 50)
      throw new Error("getUserEmailsByIds: pagination limiti aşıldı (50 sayfa)");
  }
}
