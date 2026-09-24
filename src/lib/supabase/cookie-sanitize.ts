/**
 * BOZUK AUTH ÇEREZİ SAVUNMASI (20 Eylül 2026).
 *
 * ## Ölçülen kusur
 *
 * Tek bir bozuk oturum çerezi **bütün siteyi** 500'e düşürüyordu — panel
 * değil, `/`, `/haberler` dahil. Yerelde ölçüldü:
 *
 *     Cookie: sb-<ref>-auth-token=base64-BOZUKVERI
 *     /              -> 500        ← PUBLIC ANASAYFA
 *     /haberler      -> 500
 *     /admin/giris   -> 500        ← kendini kurtarma yolu da kapalı
 *     /admin/yetkisiz-> 500
 *
 * Sebep: `@supabase/ssr` çerezi okurken base64url→UTF-8 çözümlemesi
 * yapıyor ve bozuk baytta **fırlatıyor**:
 *
 *     Error: Invalid UTF-8 sequence
 *       at stringFromUTF8 (@supabase/ssr/.../base64url.js:200)
 *       at Object.getItem (@supabase/ssr/.../cookies.js:254)
 *       at SupabaseAuthClient._recoverAndRefresh (...)
 *
 * Hata `auth.getUser()` çağrısının İÇİNDEN geliyor ve middleware her
 * rotada çalıştığı için site tamamen kapanıyor. Kullanıcı çerez temizlemeyi
 * bilmiyorsa **çıkışı olmayan bir çıkmaz**.
 *
 * ## Çözüm: kaynağında süz
 *
 * Çerez okunamıyorsa o çerez **yok sayılır** — "hata" değil, "oturum yok"
 * durumudur. Süzme `getAll()` seviyesinde yapılıyor; böylece middleware,
 * sunucu bileşenleri ve `/api` route'ları (matcher dışında!) aynı anda
 * korunuyor. Middleware ayrıca bozuk çerezi tarayıcıdan da düşürüyor
 * (`Max-Age=0`) — sistem kendini onarır.
 *
 * ## 🔴 İKİ HATA SINIFI AYRI — ölçümle (20 Eylül 2026)
 *
 * | Sınıf | Örnek | `getUser()` davranışı | Karar |
 * |---|---|---|---|
 * | **Çözümleme** | `base64-BOZUKVERI` | **FIRLATIR** (`Invalid UTF-8 sequence`) | Çerezi **SİL** |
 * | **Çözümleme** | base64 geçerli ama JSON değil | DÖNDÜRÜR (`AuthSessionMissingError`, 400) | Çerezi **SİL** |
 * | **Taşıma** | ağ yok (`fetch failed`) | DÖNDÜRÜR (`AuthRetryableFetchError`, status **0**) | Çerezi **SİLME** |
 * | **Taşıma** | Supabase 503 | DÖNDÜRÜR (`AuthRetryableFetchError`, status **503**) | Çerezi **SİLME** |
 *
 * "Fırlatırsa çözümleme, döndürürse taşıma" kuralı **YANLIŞ** — ölçüm bunu
 * çürüttü (iki sınıf da dönebiliyor). Ayrım `status` ve hata adına dayanıyor:
 * bkz. `isTransportAuthError`.
 *
 * **Neden taşıma hatasında çerez silinmez:** Supabase'de 5 dakikalık bir
 * kesintide çerezleri silersek bütün müşterilerin bütün adminleri oturumdan
 * düşer ve kesinti bitince yeniden giriş yapmak zorunda kalır. Geçici bir
 * kesintiyi kalıcı hasara çevirmiş oluruz. O istek oturumsuz sürer, çerez
 * yerinde kalır, kesinti bitince her şey kendiliğinden düzelir.
 */

/** Okunan çerezin `getAll()` şekli (hem middleware hem `cookies()` uyar). */
export interface ReadableCookie {
  name: string;
  value: string;
}

/** Supabase auth çerezi mi? (parçalı hâlleri `.0`, `.1` … dahil) */
export function isAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(name);
}

/**
 * Değer çözümlenebiliyor mu?
 *
 * Yalnız `base64-` önekli değerler çözümlenir — `@supabase/ssr`'nin fırlattığı
 * tek yer orası. Öneksiz değerler (eski biçim, düz JSON, çöp metin) kütüphane
 * tarafından zaten sessizce "oturum yok"a çevriliyor (ölçüldü), o yüzden
 * burada elenmezler: elemek gereksiz yere oturum düşürmek olurdu.
 *
 * ⚠️ Parçalı çerezlerde (`...auth-token.0`) tek parça tek başına geçerli
 * base64 OLMAYABİLİR; bu yüzden parçalar **çözümlenmeye çalışılmaz**, oldukları
 * gibi geçirilir. Kütüphane parçaları birleştirdikten sonra hata verirse
 * middleware'deki ikinci katman (try/catch + temizlik) devreye girer.
 *
 * 🔴 DEĞER `string` OLMAYABİLİR (Y1, 24 Eylül 2026 — canlıda 65 kez): middleware
 * yenileme 4xx alıp çerezi sildiğinde (`setAll` → `request.cookies.set(ad, "")`)
 * aynı istekte Node tarafının `cookies().getAll()`'u o çerezi `value: undefined`
 * ile veriyor. Eskiden burada `undefined.startsWith` → TypeError fırlıyor,
 * auth-js'in `_emitInitialSession → _useSession` zincirinde yakalanıp
 * loglanıyor ve O İSTEKTEKİ BÜTÜN anon sorgular hiç gönderilmiyordu (public
 * sayfa 200 ama verisiz; ölçüm: raporlar/2026-09-24-1334-…). Silinmiş çerez
 * "oturum yok" demektir → çözümlenemez say, elensin.
 */
export function isDecodableAuthCookieValue(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!value.startsWith("base64-")) return true;

  const payload = value.slice("base64-".length);
  if (payload === "") return false;

  try {
    const metin = new TextDecoder("utf-8", { fatal: true }).decode(
      base64UrlToBytes(payload)
    );
    return metin.length > 0;
  } catch {
    return false;
  }
}

/** base64url → bayt dizisi. Geçersiz karakterde fırlatır. */
function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(padded)) {
    throw new Error("gecersiz base64url");
  }
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Süzme sonucu — hangi çerezler geçti, hangileri elendi. */
export interface SanitizeResult<T extends ReadableCookie> {
  /** Supabase istemcisine verilecek çerezler. */
  kept: T[];
  /** Çözümlenemediği için elenen auth çerezlerinin ADLARI. */
  droppedNames: string[];
}

/**
 * Çözümlenemeyen auth çerezlerini ayıklar. SAF fonksiyon — `window` yok,
 * `document` yok, ağ yok (test doğrudan çağırır).
 *
 * Auth DIŞI çerezlere (dil tercihi, analitik, vb.) **dokunulmaz**: onların
 * biçimini bilmiyoruz ve Supabase istemcisi de onları okumuyor.
 */
export function sanitizeAuthCookies<T extends ReadableCookie>(
  cookies: readonly T[]
): SanitizeResult<T> {
  const kept: T[] = [];
  const droppedNames: string[] = [];

  for (const cookie of cookies) {
    if (isAuthCookieName(cookie.name) && !isDecodableAuthCookieValue(cookie.value)) {
      droppedNames.push(cookie.name);
      continue;
    }
    kept.push(cookie);
  }

  return { kept, droppedNames };
}

/**
 * Dönen auth hatası TAŞIMA kaynaklı mı? (→ çerez SİLİNMEZ)
 *
 * Ölçülen imzalar (20 Eylül 2026):
 *   - ağ yok   → `AuthRetryableFetchError`, status **0**
 *   - 503      → `AuthRetryableFetchError`, status **503**
 *   - çerez bozuk → `AuthSessionMissingError`, status **400**
 *
 * Ada VE status'e birlikte bakılıyor: kütüphane hata adını değiştirirse
 * `status >= 500 || status === 0` ölçütü ayakta kalır; status'u
 * doldurmazsa ad ölçütü ayakta kalır. İkisi de yoksa (tanınmayan hata)
 * **taşıma sayılır** — yani çerez SİLİNMEZ. Şüphede silmemek doğru yön:
 * yanlışlıkla silmek bütün adminleri düşürür, yanlışlıkla saklamak ise
 * yalnızca bir sonraki isteğe ertelenir.
 */
export function isTransportAuthError(
  error: { name?: string; status?: number } | null | undefined
): boolean {
  if (!error) return false;
  if (error.name === "AuthRetryableFetchError") return true;
  if (typeof error.status === "number") {
    if (error.status === 0) return true;
    if (error.status >= 500) return true;
    return false; // 4xx = saklanan oturum kullanılamaz → silinebilir
  }
  return true; // tanınmayan hata: şüphede SİLME
}
