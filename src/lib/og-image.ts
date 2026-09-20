import { PLACEHOLDER_LOGO_URL } from "./constants.ts";

/**
 * PAYLASIM GORSELI (og:image / twitter:image) — adres uretimi. (20 Eylul 2026)
 *
 * ## Neden var
 *
 * Bir haber WhatsApp'ta ya da sosyal medyada paylasildiginda onizlemede
 * icerigin KENDI kapak gorseli cikmali; yoksa kurumun logosuna dusmeli.
 * Link ciplak cikarsa tiklanmiyor — sendika sitesinde en cok yapilan is
 * haber paylasmak.
 *
 * ## Olculen durum (20 Eylul 2026, canli Storage + yerel dev sunucu)
 *
 * Ham kapak gorselleri KULLANICININ YUKLEDIGI HALDE duruyor:
 *
 *     3648x5472  2709 KB  jpeg   (dikey! oran 0.67)
 *     5712x4284  1919 KB  jpeg
 *     5473x3654  2004 KB  jpeg
 *     1200x675     71 KB  jpeg   (tek "dogru" olcu)
 *     ...webp        9 KB  webp
 *
 * Iki ayri sorun: (1) 2.7 MB'lik bir gorseli paylasim robotlari cogu zaman
 * indirmeden vazgeciyor, (2) webp'yi WhatsApp gibi istemciler cizdirmiyor.
 *
 * ## Neden `/_next/image` (OLCULDU, varsayilmadi)
 *
 * Ayni gorseller Next'in gorsel ucundan gecirilerek olculdu — istek
 * ROBOT taklidiyle yapildi (`User-Agent: facebookexternalhit/1.1`,
 * `WhatsApp/2.23`, `Twitterbot/1.0`, `TelegramBot`; `Accept` basligi
 * webp BELIRTMEDEN, yalniz joker):
 *
 *     kaynak              cikti        boyut        sure (ilk istek)
 *     2709 KB jpeg   ->   jpeg      157 KB         ~0.8 sn
 *     1919 KB jpeg   ->   jpeg      137 KB
 *     9 KB webp      ->   JPEG       12 KB         <- 🔴 webp otomatik jpeg'e cevriliyor
 *     556 KB png     ->   png       152 KB
 *
 * Dort robotun dordu de **HTTP 200** aldi; band 8-161 KB. Yani bu uc
 * robotlar icin acik, hem boyutu 17 kata kadar kuculuyor hem de
 * webp -> jpeg donusumu bedava geliyor.
 *
 * Ayni olcumde dogrulanan iki sinir:
 *  - `w` degeri Next'in `deviceSizes` listesinde OLMALI: `w=1200` -> 200,
 *    `w=1201` -> **400**. Bu yuzden 1200 sabit ve next.config'de
 *    `images.deviceSizes` TANIMLANMAMALI (varsayilan liste 1200 iceriyor).
 *  - Uc acik proxy DEGIL: `images.remotePatterns` disindaki bir adres
 *    (`https://example.com/a.jpg`) -> **400**.
 *
 * Reddedilen alternatif: Supabase'in kendi gorsel donusumu
 * (`/storage/v1/render/image/public/...`) -> **HTTP 403** (Pro plani
 * ozelligi; proje FREE'de kalacak, musteri karari).
 *
 * ## Mutlak adres
 *
 * Buradan donen `/_next/image?...` adresi GORELIDIR; root layout'taki
 * tenant-aware `metadataBase` (buildTenantPublicUrl) onu mutlaga cevirir —
 * `og:url` ile ayni mekanizma. Boylece her kurumun onizleme gorseli KENDI
 * alan adindan servis edilir (custom domain'li kurumda musterinin kendi
 * domaini). Olcum: `scripts/test-og-image.mjs` + deploy sonrasi manuel test.
 */

/**
 * Paylasim gorselinin genisligi. Facebook/WhatsApp/X'in tavsiye ettigi
 * 1200x630'un genislik ayagi. YUKSEKLIK ZORLANMAZ: Next'in gorsel ucu
 * kirpma yapmaz, yalniz olcekler — icerigin kendi orani korunur,
 * platformlar gerekirse kendileri kirpar. 1200 degeri Next'in varsayilan
 * `deviceSizes` listesinde oldugu icin gecerli (bkz. baslik).
 */
export const OG_IMAGE_WIDTH = 1200;

/** Next'in gorsel ucunun varsayilan kalitesi. 75 -> 8-161 KB bandi (olculdu). */
export const OG_IMAGE_QUALITY = 75;

/** Next'in gorsel optimizasyon ucu. */
export const NEXT_IMAGE_PATH = "/_next/image";

/**
 * Bu adres Next'in gorsel ucundan gecirilebilir mi?
 *
 * Kural `next.config.mjs` -> `images.remotePatterns` ile SENKRON olmali:
 * orada izin verilmeyen bir adres ucta **400** doner, yani og:image
 * tamamen bozulur. Bu yuzden eslesmeyen adresler ucta DENENMEZ, ham
 * haliyle kullanilir (bkz. buildOgImageUrl).
 */
export function isOptimizableStorageUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.hostname.endsWith(".supabase.co") &&
    url.pathname.startsWith("/storage/v1/object/public/")
  );
}

/**
 * Ham bir gorsel degerini paylasima uygun adrese cevirir; uygun degilse
 * `null` (o zaman etiket HIC yazilmaz — yanlis/404 bir adres yazmaktan
 * iyidir).
 *
 * 🔴 UC DEGER BILEREK ELENIR:
 *
 *  1. `PLACEHOLDER_LOGO_URL` (`/placeholder-logo.png`) — bu bir dosya
 *     degil, "gercek logo YOK" SENTINEL'i (bkz. constants.ts). Canli
 *     olcumde Kurmay Teknoloji'nin `site_settings.logo_url` degeri tam
 *     olarak buydu; elenmeseydi og:image
 *     `https://kurmayteknoloji.com/placeholder-logo.png` olur ve **404**
 *     verirdi — `public/` klasoru repoda YOK.
 *  2. Goreli adresler — paylasim robotlari icin anlamsiz. metadataBase
 *     bunlari cozerdi ama cozulen adresin arkasinda bir dosya oldugunu
 *     BILMIYORUZ; sessizce 404 onizleme uretmektense hic uretmemek dogru.
 *  3. Bos / bosluk.
 */
export function buildOgImageUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw) return null;
  if (raw === PLACEHOLDER_LOGO_URL) return null;
  if (!/^https?:\/\//i.test(raw)) return null;

  if (!isOptimizableStorageUrl(raw)) {
    // Bizim Storage'imiz disindaki mutlak adres: optimizasyon ucu 400
    // dondurur, ham adres ise calisir. Fail-open ama GECERLI.
    return raw;
  }

  return `${NEXT_IMAGE_PATH}?url=${encodeURIComponent(
    raw
  )}&w=${OG_IMAGE_WIDTH}&q=${OG_IMAGE_QUALITY}`;
}

/**
 * Oncelik zinciri: ilk KULLANILABILIR aday kazanir.
 *
 * 🔴 COK KIRACILI KURAL: adaylarin hepsi CAGIRAN TARAFIN o isteğe ait
 * kurumundan gelmeli (icerigin kapagi -> o kurumun logosu). Platform
 * geneli sabit bir varsayilan gorsel BILEREK YOK: beyaz etiket urunde
 * musterinin linkinde baska bir kurumun/platformun markasi cikmasi
 * kabul edilemez. Aday kalmazsa etiket yazilmaz.
 */
export function pickOgImage(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const url = buildOgImageUrl(candidate);
    if (url) return url;
  }
  return null;
}
