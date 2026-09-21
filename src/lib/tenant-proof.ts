/**
 * KURUM BAŞLIĞI KANITI — `x-tenant-proof` (K7-B, 21 Eylül 2026).
 *
 * NEDEN: render katmanı kurumu `x-tenant-slug` isteği başlığından okuyor.
 * Middleware bu başlığı her çalıştığında YAZAR, ama middleware'in çalışmadığı
 * bir yolda (matcher dışı 404) başlığı istemci KENDİSİ gönderebilir ve render
 * ikisini ayıramaz — K7 (ölçüldü: `/_next/static/yok.js` + sahte başlık →
 * başka kurumun kimliği). Çözüm: middleware slug'ın yanına, istemcinin
 * üretemeyeceği bir kanıt yazar; render slug'ı YALNIZ kanıt doğrulanırsa okur.
 *
 *   x-tenant-proof = hex( HMAC-SHA256( TENANT_HEADER_SECRET, host + "\n" + slug ) )
 *
 * - HMAC, düz sır değil: kanıt bir gün sızarsa (yanıta yazılır, loglanır)
 *   yalnız AYNI host + slug için geçerlidir — middleware'in zaten yazacağı şey.
 *   Düz sır sızsa her host'ta her slug taklit edilebilirdi.
 * - Host küçük harfe çevrilir (DNS adları büyük/küçük harf duyarsız; iki taraf
 *   da bu modülden geçtiği için tutarlı). Slug olduğu gibi imzalanır.
 * - YALNIZ Web Crypto (`globalThis.crypto.subtle`): middleware Edge
 *   sandbox'ında, render Node'da çalışıyor; `node:crypto` Edge'de yok.
 * - Doğrulama `crypto.subtle.verify` ile — sabit zamanlı karşılaştırma.
 *
 * 🔴 Kanıt YALNIZ İSTEK başlığına yazılır. Next 14 middleware'in YANITA
 * yazdığı her başlığı hem istemciye hem isteğe kopyalıyor (resolve-routes.js
 * 401-403; ölçüldü) — yanıta yazılan kanıt istemciye gider. Test: izolasyon
 * matrisi "yanit|ic-baslik-sizmaz".
 *
 * SIR YOKSA FAIL-CLOSED: `imzala` reddeder, `dogrula` her zaman false döner,
 * sunucu log'una BİR KEZ ayırt edici satır düşer. Sonuç: her istek `no-header`
 * → public site nötr 404, admin "Kurum bulunamadı" — sessizce açık kalmaz.
 * Build kapısı: next.config.mjs (TENANT_HEADER_SECRET yok / kısa → build durur).
 */

/** Sırrın en kısa uzunluğu — next.config.mjs build kapısıyla AYNI. */
export const TENANT_SECRET_MIN_LENGTH = 32;

/** SHA-256 HMAC → 32 bayt → 64 hex karakter. */
const KANIT_HEX_UZUNLUGU = 64;

const kodlayici = new TextEncoder();

/**
 * Anahtar modül seviyesinde önbellekte: `importKey` istek başına değil, sır
 * başına BİR KEZ. Sır değişirse (test, ya da süreç içinde env değişimi) yeni
 * anahtar içe aktarılır — eski sırla üretilmiş kanıt böylece reddedilir.
 */
let onbellek: { sir: string; anahtar: Promise<CryptoKey> } | null = null;
let sirYokBildirildi = false;

function anahtar(): Promise<CryptoKey> | null {
  const sir = process.env.TENANT_HEADER_SECRET;
  if (!sir || sir.length < TENANT_SECRET_MIN_LENGTH) {
    if (!sirYokBildirildi) {
      sirYokBildirildi = true;
      console.error(
        "[tenant-proof] TENANT_HEADER_SECRET yok ya da " +
          `${TENANT_SECRET_MIN_LENGTH} karakterden kisa — kurum kaniti uretilemiyor/dogrulanamiyor. ` +
          "FAIL-CLOSED: butun istekler notr 404'e duser. Sunucudaki .env'i kontrol edin."
      );
    }
    return null;
  }
  if (!onbellek || onbellek.sir !== sir) {
    onbellek = {
      sir,
      anahtar: globalThis.crypto.subtle.importKey(
        "raw",
        kodlayici.encode(sir),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign", "verify"]
      ),
    };
  }
  return onbellek.anahtar;
}

function mesaj(host: string, slug: string): Uint8Array<ArrayBuffer> {
  return kodlayici.encode(`${host.toLowerCase()}\n${slug}`);
}

function hexYaz(tampon: ArrayBuffer): string {
  const bayt = new Uint8Array(tampon);
  let s = "";
  for (let i = 0; i < bayt.length; i++) s += bayt[i].toString(16).padStart(2, "0");
  return s;
}

/** Yalnız tam uzunlukta, KÜÇÜK harfli hex kabul edilir; aksi hâlde null. */
function hexOku(s: string): Uint8Array<ArrayBuffer> | null {
  if (typeof s !== "string" || s.length !== KANIT_HEX_UZUNLUGU || !/^[0-9a-f]+$/.test(s)) return null;
  const out = new Uint8Array(KANIT_HEX_UZUNLUGU / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/**
 * host + slug için kanıt (64 karakter küçük harf hex). Sır yoksa REDDEDER —
 * çağıran (middleware) kanıt yazmamalı ve gelen kanıtı silmeli.
 */
export async function imzala(host: string, slug: string): Promise<string> {
  const k = anahtar();
  if (!k) throw new Error("TENANT_HEADER_SECRET yok — kurum kaniti uretilemez");
  const imza = await globalThis.crypto.subtle.sign("HMAC", await k, mesaj(host, slug));
  return hexYaz(imza);
}

/**
 * Kanıt bu host + slug için middleware'in üreteceği kanıt mı? Sabit zamanlı
 * (`crypto.subtle.verify`). ATMAZ: bozuk/boş/kısa/hex olmayan kanıt ve sır
 * yokluğu `false` döner.
 */
export async function dogrula(host: string, slug: string, kanit: string | null | undefined): Promise<boolean> {
  const bayt = hexOku(kanit ?? "");
  if (!bayt) return false;
  const k = anahtar();
  if (!k) return false;
  try {
    return await globalThis.crypto.subtle.verify("HMAC", await k, bayt, mesaj(host, slug));
  } catch {
    return false;
  }
}
