/**
 * RLS'in SESSIZ reddini yakalar (19 Eylul 2026).
 *
 * 🔴 SORUN: PostgreSQL'de RLS bir **INSERT**'i reddederken hata firlatir
 * (`42501 new row violates row-level security policy`), ama **UPDATE** ve
 * **DELETE**'i reddederken FIRLATMAZ — sadece HICBIR SATIRI eslestirmez.
 * supabase-js `.select()` olmadan cagrildiginda `error: null` doner, yani
 * cagiran kod islemi BASARILI sanar:
 *
 *     const { error } = await supabase.from("news").delete().eq("id", x);
 *     if (error) { ... }          // <- error null
 *     toast.success("Haber silindi.");   // <- YALAN, hicbir sey silinmedi
 *
 * Bu YALNIZ "yetkisi kaldirilmis admin" senaryosuna ozel degil: ileride
 * herhangi bir politika hatasi da ayni yalani uretir. Olculdu (19 Eylul,
 * yerel PostgreSQL): uyelikten cikarilmis kullanicida DELETE ve UPDATE
 * "0 satir, hata yok" donuyor.
 *
 * COZUM: sorguya `.select("id")` zincirlenir (PostgREST etkilenen satirlari
 * dondurur) ve 0 satir SENTETIK BIR HATAYA cevrilir. Boylece cagiran
 * taraftaki mevcut `if (error)` dallari OLDUGU GIBI dogru calisir — 45
 * cagri noktasinda `if` govdelerini yeniden yazmak gerekmedi.
 *
 * ⚠️ NEREDE KULLANILMAZ — "0 satir" DOGRU sonuc olabilen yazmalar:
 *   - Temizlik silmeleri (haber silinince manset/content_media temizligi):
 *     icerik zaten mansette degilse 0 satir BEKLENEN sonuctur; burada
 *     dogrulama SAHTE HATA uretir.
 *   - Arka plan guncellemeleri (gelen mesaji "okundu" isaretleme):
 *     kullaniciya basari mesaji gosterilmiyor, yalan da soylenmiyor.
 *   - INSERT / UPSERT: RLS bunlari zaten hata ile reddediyor (olculdu).
 *
 * KURAL: kullaniciya BASARI ya da HATA mesaji gosterilen her UPDATE/DELETE
 * bu yardimciyla sarilir.
 */

/** PostgREST hatasinin okudugumuz kadari (`code` 23505 gibi kontroller icin). */
export interface WriteError {
  message: string;
  code?: string;
}

interface WriteResponse {
  data: unknown[] | null;
  error: WriteError | null;
}

/** `.select()` zincirlenebilen PostgREST yazma sorgusu (update/delete). */
export interface SelectableWrite {
  select(columns: string): PromiseLike<WriteResponse>;
}

/**
 * RLS sessizce engellediginde uretilen sentetik hata.
 *
 * `code` BILEREK PostgreSQL kodlarindan farkli: cagiran taraftaki
 * `error.code === "23505"` gibi kontroller yanlislikla eslesmesin.
 */
export const RLS_BLOCKED: WriteError = {
  message:
    "İşlem uygulanmadı: hiçbir satır etkilenmedi. Bu kuruma erişim yetkiniz " +
    "kaldırılmış olabilir — sayfayı yenileyin.",
  code: "RLS_NO_ROWS",
};

/**
 * Yazma sorgusunu calistirir ve ETKILENEN SATIR OLMAMASINI hata sayar.
 *
 * Kullanim — mevcut `if (error)` dali degismez:
 *
 *     const { error } = await verifyWrite(supabase
 *       .from("news")
 *       .delete()
 *       .eq("tenant_id", tenant.id)
 *       .eq("id", id));
 *
 * @returns Gercek PostgREST hatasi AYNEN gecirilir (`code` korunur);
 *   hata yokken 0 satir donduyse `RLS_BLOCKED`.
 */
export async function verifyWrite(
  query: SelectableWrite
): Promise<{ error: WriteError | null }> {
  const { data, error } = await query.select("id");
  if (error) return { error };
  if (!data || data.length === 0) return { error: RLS_BLOCKED };
  return { error: null };
}
