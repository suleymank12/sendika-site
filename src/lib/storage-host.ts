/**
 * GORSEL UCUNUN KAYNAK KURALI — tek kaynak (21 Eylul 2026, Faz 1).
 *
 * ## Neden var
 *
 * Next'in gorsel ucu (`/_next/image`) izin verilen adresten gorseli SUNUCUDA
 * indirip sharp ile isliyor. Kural eskiden `*.supabase.co` idi, yani
 * HERHANGI BIRININ Supabase projesi: saldirgan ucretsiz bir proje acip
 * icine hazirlanmis bir AVIF koyarak sharp'in libheif'ine (GHSA-2xp9-vwfh-vxw4,
 * kritik, glibc Linux'ta RCE) ya da devasa bir gorselle bellege
 * (GHSA-9g9p-9gw9-jx7f) kimliksiz ulasabiliyordu. Kural artik YALNIZ bizim
 * projemiz: `NEXT_PUBLIC_SUPABASE_URL`'in host'u.
 *
 * ## Neden env'den, neden sabit degil
 *
 * Proje adresini koda gommek beyaz etiket urune uymuyor ve proje degisirse
 * sessizce eskir. Env zaten uygulamanin konustugu projenin TANIMI; build
 * aninda gomuluyor (istemcide de `process.env.NEXT_PUBLIC_…` build'de
 * literale cevrilir). Olcum (21 Eylul, canli DB, 20 tablonun tamami):
 * 31 Supabase adresinin 31'i bu host'ta, yabanci host 0 — daraltma hicbir
 * icerigi kirmadi.
 *
 * ## Uc tuketici, tek kural — SENKRON ZORUNLU
 *
 *   1. `next.config.mjs` `images.remotePatterns`  (TS import edemez → ayni
 *      ayristirmanin kucuk bir kopyasi; esitligini test mühürlüyor)
 *   2. `utils.ts` `isNextImageSafeUrl`  → SafeImage / galeri / detay
 *   3. `og-image.ts` `isOptimizableStorageUrl`  → paylasim gorseli
 *
 * 🔴 Biri genis digeri dar kalirsa: (2) genis → yabanci adres SafeImage'dan
 * gecer, next/image "hostname is not configured" firlatir, SAYFA 500'e
 * duser. (3) genis → og:image adresi uçta 400 verir, paylasim onizlemesi
 * olur. Bu yuzden ucu de BURADAKI fonksiyonu kullanir.
 *
 * Fail-closed: env yok/bozuksa host `null` → hicbir uzak adres "bizim"
 * sayilmaz (SafeImage fallback cizer, og:image ham adrese duser);
 * `next.config.mjs` ise build'i HATAYLA durdurur.
 *
 * React/Next bagimsiz, saf modul — `scripts/test-gorsel-zinciri.mjs`
 * dogrudan calistirir.
 */

/** Yalniz public nesneler; imzali (`/sign/`) ve render yollari DISARIDA. */
export const STORAGE_PUBLIC_PATH_PREFIX = "/storage/v1/object/public/";

/**
 * Supabase proje adresinden host'u cikarir. Ayristirilamayan / bos girdide
 * `null` — ASLA throw etmez.
 */
export function hostFromSupabaseUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const host = new URL(raw.trim()).hostname;
    return host || null;
  } catch {
    return null;
  }
}

/**
 * Uygulamanin bagli oldugu projenin host'u.
 *
 * ⚠️ `process.env.NEXT_PUBLIC_SUPABASE_URL` TAM BU YAZIMLA kalmali: Next
 * istemci paketinde yalniz bu kalibi literale ceviriyor; destructuring ya
 * da `process.env[ad]` istemcide `undefined` olur ve butun gorseller
 * fallback'e duser.
 */
export function ownStorageHost(): string | null {
  return hostFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
}

/**
 * Adres BIZIM projemizin public Storage nesnesi mi?
 *
 * Hepsi birden saglanmali: https · host TAM esit (sonek/onek benzerligi
 * yetmez) · varsayilan port · kullanici bilgisi yok · public yol.
 */
export function isOwnPublicStorageUrl(
  raw: unknown,
  host: string | null = ownStorageHost()
): boolean {
  if (!host || typeof raw !== "string") return false;
  const value = raw.trim();
  if (!value) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname === host.toLowerCase() &&
    url.port === "" &&
    url.username === "" &&
    url.password === "" &&
    url.pathname.startsWith(STORAGE_PUBLIC_PATH_PREFIX)
  );
}
