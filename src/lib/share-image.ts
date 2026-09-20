/**
 * PAYLASIM GORSELI — yukleme tarafindaki olcu/oran degerlendirmesi.
 * (21 Eylul 2026, teshis: raporlar/2026-09-21-0137-kapak-gorseli-yukleme-teshis.md)
 *
 * ## Neden var
 *
 * 20 Eylul'de og:image adresini duzelttik (lib/og-image.ts): her kurum kendi
 * kapagini/logosunu, Next'in gorsel ucundan kuculterek paylasiyor. ORAN
 * bilerek acik birakilmisti — "kirpma karari icerigin sahibinindir, kodun
 * tahmini kotu kirpar". Bu dosya o kararin kullaniciya gecirildigi yer:
 * kod kirpmaz, kullaniciya NE OLACAGINI gosterir.
 *
 * ## Olculen durum (21 Eylul 2026, canli Storage — 25 gorsel kaydi)
 *
 *     3648x5472  oran 0.67   1.91:1 cercevede %65 alan kaybi
 *     2813x3679  oran 0.76   %60
 *      311x675   oran 0.46   %76  <- 🔴 ve 600x315 esiginin ALTINDA
 *      485x135   oran 3.59   %47  <- 🔴 esigin altinda
 *      600x840   oran 0.71   %63  <- 🔴 DEFAULT KURUMUN LOGOSU (anasayfa!)
 *
 * ## Esikler nereden geliyor
 *
 * Facebook belgesi (developers.facebook.com/docs/sharing/webmasters/images,
 * 21 Eylul 2026'da dogrudan okundu, birebir):
 *   - "Use images that are at least 1200 x 630 pixels"
 *   - "At the minimum, you should use images that are 600 x 315 pixels"
 *   - "Try to keep your images as close to 1.91:1 aspect ratio as possible"
 *   - "If your image is smaller than 600 x 315 px, it will still display in
 *      the link page post, but the size will be much smaller"
 *
 * MIN_PAYLASIM_GENISLIK/YUKSEKLIK dogrudan o belgeden. Oran esikleri
 * (1.4 / 2.5) ise 1.91 hedefinin etrafinda ~%25 alan kaybina denk gelen
 * noktalar: 1.4 -> %27 kayip, 2.5 -> %24 kayip. Daha dar bir bant her
 * normal fotografta uyari cikarirdi (uyari korlugu); daha genis bant
 * 0.67 gibi gercekten kotu oranlari kacirirdi.
 *
 * ⚠️ Bu esikler UYARIDIR, ENGEL DEGIL. Yukleme asla durdurulmaz: hangi
 * gorselin yayimlanacagi editorun karari. Kod yalniz bilgilendirir.
 */

/** Paylasim cercevesinin orani (Facebook/WhatsApp/X ortak hedefi). */
export const PAYLASIM_ORANI = 1.91;

/** Onerilen paylasim olcusu — kutularda gosterilen metin bundan uretilir. */
export const ONERILEN_GENISLIK = 1200;
export const ONERILEN_YUKSEKLIK = 630;

/** Facebook belgesi: bunun altinda onizleme "much smaller" gosteriliyor. */
export const MIN_PAYLASIM_GENISLIK = 600;
export const MIN_PAYLASIM_YUKSEKLIK = 315;

/** Oran bandi — disina cikan gorsel paylasimda belirgin sekilde kirpilir. */
export const MIN_ORAN = 1.4;
export const MAX_ORAN = 2.5;

export interface GorselOlcusu {
  width: number;
  height: number;
}

export type GorselYonu = "yatay" | "dikey" | "kare";

export interface PaylasimDegerlendirmesi {
  /** "ok": uyari yok. "uyari": en az bir esik disi. */
  seviye: "ok" | "uyari";
  /** genislik / yukseklik, 2 basamaga yuvarlanmis. */
  oran: number;
  yon: GorselYonu;
  /** "3648×5472 piksel (dikey)" */
  olcuMetni: string;
  /** Kullaniciya gosterilecek uyarilar (bos olabilir). */
  uyarilar: string[];
}

/**
 * Yon: tam kare olmayan ama neredeyse kare gorseller "kare" sayilir
 * (696x675 gibi). Aksi halde 1.03 oranli bir gorsele "yatay" demek
 * kullaniciyi yaniltirdi.
 */
export function gorselYonu(olcu: GorselOlcusu): GorselYonu {
  const oran = olcu.width / olcu.height;
  if (oran >= 1.05) return "yatay";
  if (oran <= 0.95) return "dikey";
  return "kare";
}

/** "3648×5472 piksel (dikey)" — panelde tek satirda gosterilir. */
export function olcuMetni(olcu: GorselOlcusu): string {
  return `${olcu.width}×${olcu.height} piksel (${gorselYonu(olcu)})`;
}

/**
 * Bir gorselin paylasim onizlemesinde nasil davranacagini degerlendirir.
 *
 * Uyarilar BIRIKIR: 311x675 hem "cok dikey" hem "cok kucuk" uyarisi alir —
 * ikisi farkli sorunlar ve cozumleri farkli (biri kirpilir, oteki kucucuk
 * gorunur). Tek uyariya indirmek bilgi kaybi olurdu.
 *
 * Gecersiz olcu (0 veya negatif) "ok" DONMEZ: olcemedigimiz bir gorseli
 * saglam saymak bu projenin tekrar eden kusuru (sessiz basarisizlik).
 */
export function degerlendir(olcu: GorselOlcusu): PaylasimDegerlendirmesi {
  const { width, height } = olcu;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {
      seviye: "uyari",
      oran: 0,
      yon: "kare",
      olcuMetni: "ölçü okunamadı",
      uyarilar: ["Görselin ölçüsü okunamadı. Paylaşımda nasıl görüneceğini gösteremiyoruz."],
    };
  }

  const ham = width / height;
  const oran = Math.round(ham * 100) / 100;
  const yon = gorselYonu(olcu);
  const uyarilar: string[] = [];

  if (ham < MIN_ORAN) {
    // 🔴 "dikey" demek her zaman DOGRU DEGIL: 5712x4284 (oran 1,33) yatay bir
    // fotograftir ama paylasim cercevesine gore hala dardir. Kullaniciya
    // gozuyle gordugunun tersini soylemek uyariyi inandiriciliktan dusurur.
    const sekil = yon === "yatay" ? "paylaşım çerçevesine göre dar" : yon;
    uyarilar.push(
      `Bu görsel ${sekil}. Paylaşıldığında üstü ve altı kesilir — daha yatay bir görsel daha iyi sonuç verir.`
    );
  } else if (ham > MAX_ORAN) {
    uyarilar.push(
      "Bu görsel çok geniş. Paylaşıldığında yanları kesilir."
    );
  }

  if (width < MIN_PAYLASIM_GENISLIK || height < MIN_PAYLASIM_YUKSEKLIK) {
    uyarilar.push(
      `Bu görsel paylaşımlarda küçük görünür. En az ${ONERILEN_GENISLIK}×${ONERILEN_YUKSEKLIK} piksel önerilir.`
    );
  }

  return {
    seviye: uyarilar.length > 0 ? "uyari" : "ok",
    oran,
    yon,
    olcuMetni: olcuMetni(olcu),
    uyarilar,
  };
}

/**
 * Bir gorselin gercek olcusunu okur. File (yeni secilen) ya da URL
 * (kayitli Storage adresi) kabul eder.
 *
 * 🔴 CORS GEREKMEZ: yalniz `naturalWidth/naturalHeight` okunuyor, canvas'tan
 * piksel OKUNMUYOR. Bu yuzden Supabase Storage'a ek bir CORS ayari gerekmez —
 * kayitli gorseller de olculebiliyor (teshis raporu, secenek b).
 *
 * Hata durumunda `null` doner (bozuk adres, silinmis dosya, ag hatasi):
 * cagiran taraf "olculemedi" durumunu gostermeli, sessizce saglam saymamali.
 *
 * Yalniz tarayicida calisir; sunucuda cagrilmamali.
 */
export function gorselOlcusunuOku(
  kaynak: File | string
): Promise<GorselOlcusu | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve(null);
      return;
    }

    const dosyaMi = typeof kaynak !== "string";
    const adres = dosyaMi ? URL.createObjectURL(kaynak as File) : (kaynak as string);
    const img = new Image();

    const temizle = () => {
      if (dosyaMi) URL.revokeObjectURL(adres);
    };

    img.onload = () => {
      const olcu = {
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
      };
      temizle();
      resolve(olcu.width > 0 && olcu.height > 0 ? olcu : null);
    };
    img.onerror = () => {
      temizle();
      resolve(null);
    };

    img.src = adres;
  });
}
