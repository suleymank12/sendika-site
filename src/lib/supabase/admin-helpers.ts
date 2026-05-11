import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Email'e göre Supabase Auth user'ı bulur.
 * supabase-js v2.101'de getUserByEmail tipte/runtime'da yok, listUsers ile pagination yapıyoruz.
 * Email büyük/küçük harf duyarsız karşılaştırılır.
 */
export async function findUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<{ id: string; email: string } | null> {
  const target = email.trim().toLowerCase();
  const perPage = 1000;
  let page = 1;

  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users ?? [];
    const found = users.find((u) => (u.email ?? "").toLowerCase() === target);
    if (found) return { id: found.id, email: found.email ?? "" };

    if (users.length < perPage) return null; // son sayfa
    page += 1;

    // Güvenlik: sonsuz döngü koruması (çok büyük platformlarda makul üst sınır)
    if (page > 50) throw new Error("findUserByEmail: pagination limiti aşıldı (50 sayfa)");
  }
}
