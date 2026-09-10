import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Bağlantısız (yetim) Auth hesapları — hiçbir kuruma bağlı olmayan ve süper
 * admin de olmayan kullanıcılar.
 *
 * NASIL OLUŞUR (10 Eylül 2026 ölçümü: auth.users'a bağlanan 10 FK'nin hepsi
 * ON DELETE CASCADE → deleteUser'ı KALICI engelleyen sebep yok; aşağıdakiler
 * ancak geçici hatayla — ağ / zaman aşımı — tetiklenir):
 *  - tenant-users DELETE: cleanupOrphanUserIfNeeded "error" döner, üyelik
 *    satırı yine silinir (erişimi kaldırmak hesabı silmekten önemli) → 207.
 *  - delete-tenant: kurum silinir, bir üyenin hesabı temizlenemez → 207.
 *  - Davet hesabı oluşturur ama ardından tenant_users eklemesi (23505 dışı)
 *    hata verir (tenant-users POST / create-tenant).
 *
 * NEDEN LİSTE + ELLE SİLME (otomatik temizlik değil): hesap silmek geri
 * alınamaz; KURULUM Adım 5'te süper admin hesabı Auth'ta açılıp
 * super_admins'e eklenene kadar geçen sürede de "bağlantısız" görünür.
 * Silme her zaman süper admin onayıyla ve cleanupOrphanUserIfNeeded üzerinden
 * yapılır — silme ANINDA üyelik + süper admin kontrolü yeniden yapılır.
 *
 * Bu modül bilerek importsuz (yalnız tip importu) — scripts/test-orphan-users.mjs
 * doğrudan çalıştırabilsin.
 */

/** Panel sayfası — 207 uyarıları buraya yönlendirir. */
export const ORPHAN_ACCOUNTS_PATH = "/super-admin/baglantisiz-hesaplar";

export interface OrphanUser {
  id: string;
  email: string;
  created_at: string | null;
  /** null = hiç giriş yapmamış (daveti kabul etmemiş). */
  last_sign_in_at: string | null;
  invited_at: string | null;
}

/** listUsers'ın döndürdüğü kullanıcıdan okunan alanlar. */
export interface AuthUserRow {
  id: string;
  email?: string | null;
  created_at?: string | null;
  last_sign_in_at?: string | null;
  invited_at?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Saf seçim: üyeliği olmayan ve süper admin olmayan kullanıcılar, en yeni
 * önce (yeni oluşan yetim üstte görünsün). Tarih okunamazsa en sona düşer.
 */
export function selectOrphanUsers(
  users: readonly AuthUserRow[],
  memberUserIds: Iterable<string>,
  superAdminIds: Iterable<string>
): OrphanUser[] {
  const members = new Set(memberUserIds);
  const superAdmins = new Set(superAdminIds);
  const time = (value: string | null): number => {
    const t = value ? Date.parse(value) : NaN;
    return Number.isFinite(t) ? t : -Infinity;
  };

  return users
    .filter((u) => !members.has(u.id) && !superAdmins.has(u.id))
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      created_at: u.created_at ?? null,
      last_sign_in_at: u.last_sign_in_at ?? null,
      invited_at: u.invited_at ?? null,
    }))
    .sort((a, b) => {
      const ta = time(a.created_at);
      const tb = time(b.created_at);
      return ta === tb ? 0 : tb > ta ? 1 : -1;
    });
}

const MAX_PAGES = 50;
const AUTH_PAGE = 1000;
const ROW_PAGE = 1000;

/**
 * Tüm Auth kullanıcıları. Sayfalama findUserByEmail / getUserEmailsByIds
 * (lib/supabase/admin-helpers) ile aynı desende: perPage 1000, son sayfa
 * tespiti, 50 sayfa üst sınırı. Hata → throw.
 */
async function listAllAuthUsers(admin: SupabaseClient): Promise<AuthUserRow[]> {
  const all: AuthUserRow[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE });
    if (error) throw error;
    const users = data?.users ?? [];
    all.push(...users);
    if (users.length < AUTH_PAGE) return all;
  }
  throw new Error("listOrphanUsers: Auth sayfalama limiti aşıldı (50 sayfa)");
}

/**
 * Bir tablodaki TÜM user_id'ler.
 *
 * PostgREST satır üst sınırı (Supabase "Max rows", varsayılan 1000) yanıtı
 * SESSİZCE keser. Kesik bir üyelik listesi kurumlu kişileri "bağlantısız"
 * gösterirdi — tenant-users/list'teki "listUsers yalnızca ilk sayfa" bug'ının
 * eşi. Bu yüzden: birincil anahtarla kararlı sıralama + range sayfalama +
 * toplam sayıya (count) ulaşana dek devam. Sayfa istenenden az dönse de
 * dönen kadar ilerlenir (backup-storage.mjs'teki list() dersi).
 */
export async function fetchAllUserIds(
  admin: SupabaseClient,
  table: "tenant_users" | "super_admins"
): Promise<string[]> {
  const orderColumn = table === "tenant_users" ? "id" : "user_id";
  const ids: string[] = [];
  let from = 0;
  let total: number | null = null;

  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error, count } = await admin
      .from(table)
      .select("user_id", { count: "exact" })
      .order(orderColumn)
      .range(from, from + ROW_PAGE - 1);
    if (error) throw error;
    if (total === null) total = count ?? Number.POSITIVE_INFINITY;

    const rows = (data ?? []) as { user_id: string | null }[];
    for (const row of rows) {
      if (row.user_id) ids.push(row.user_id);
    }
    from += rows.length;
    if (rows.length === 0 || from >= total) return ids;
  }
  throw new Error(`fetchAllUserIds(${table}): sayfalama limiti aşıldı (50 sayfa)`);
}

/**
 * Bağlantısız hesaplar.
 *
 * SIRA ÖNEMLİ: önce Auth kullanıcıları, SONRA üyelikler. İki okuma arasında
 * davetle eklenen biri (önce hesap, sonra üyelik) ya Auth listesinde yoktur ya
 * da üyeliği de görülür — "bağlantısız" diye yanlış görünmez. Ters sırada,
 * okumaların arasında oluşan hesap üyeliksiz görünebilirdi.
 *
 * Hata → throw (fail-closed): eksik veriyle liste göstermek kurumlu birini
 * "bağlantısız" gösterebilir.
 */
export async function listOrphanUsers(admin: SupabaseClient): Promise<OrphanUser[]> {
  const users = await listAllAuthUsers(admin);
  const [memberIds, superAdminIds] = await Promise.all([
    fetchAllUserIds(admin, "tenant_users"),
    fetchAllUserIds(admin, "super_admins"),
  ]);
  return selectOrphanUsers(users, memberIds, superAdminIds);
}

/**
 * 207 uyarısında temizlenemeyen hesapların listesi: ilk 3 e-posta yazılır,
 * fazlası "ve N hesap daha" olur. E-postası bilinmeyenler sayı olarak eklenir.
 */
export function describeOrphanAccounts(emails: readonly (string | null | undefined)[]): string {
  const known = emails.filter((e): e is string => typeof e === "string" && e.trim() !== "");
  const unknownCount = emails.length - known.length;
  const shown = known.slice(0, 3);
  const rest = known.length - shown.length + unknownCount;

  if (shown.length === 0) return `${emails.length} hesap`;
  return rest > 0 ? `${shown.join(", ")} ve ${rest} hesap daha` : shown.join(", ");
}
