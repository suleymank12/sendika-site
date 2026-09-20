"use client";

import { useEffect, useState } from "react";
import SafeImage from "@/components/SafeImage";
import { AlertTriangle, Check, Share2 } from "lucide-react";
import {
  ONERILEN_GENISLIK,
  ONERILEN_YUKSEKLIK,
  degerlendir,
  gorselOlcusunuOku,
  type PaylasimDegerlendirmesi,
} from "@/lib/share-image";

/**
 * PAYLASIM ONIZLEMESI — "paylasildiginda boyle gorunecek".
 * (21 Eylul 2026 — teshis raporu secenek (b))
 *
 * ## Ne yapar
 *
 * Kapak gorselinin GERCEK olcusunu yazar ve 1,91:1 cercevede ne kalacagini
 * gosterir. Kirpmayi KOD YAPMAZ; kullanici gorur ve kendisi karar verir.
 *
 * ## 🔴 Neden iki onizleme var ve celismiyorlar
 *
 * ImageUploader'in kendi onizlemesi 21 Eylul'e kadar `object-cover` idi:
 * 3648x5472 dikey bir fotograf orada duzgun, genis, yatay bir SERIT gibi
 * gorunuyordu — yani kutu sorunu GIZLIYORDU. O onizleme artik
 * `object-contain` (gercek sekil, kirpilmadan). Bu bilesen ise bilerek
 * `object-cover` kullanir ve ustunde "Paylasildiginda boyle gorunecek"
 * yazar. Ikisi ayni seyi iddia etmiyor:
 *
 *     ImageUploader onizlemesi  = gorselin GERCEK hali  (contain)
 *     SharePreview              = paylasimda KALAN kismi (cover, 1,91:1)
 *
 * ## Kayitli gorseller de olculur
 *
 * Olcu URL'den okunur (bkz. lib/share-image.ts → gorselOlcusunuOku), yani
 * eski bir haber duzenlemeye acildiginda uyari KENDILIGINDEN cikar. Geriye
 * donuk toplu islem bu yuzden gerekmiyor.
 *
 * ## Olculemezse
 *
 * "Olculemedi" ayri bir durum olarak GOSTERILIR — sessizce "saglam" sayilmaz.
 */

interface SharePreviewProps {
  /** Kayitli gorselin adresi. Bos/null ise bilesen hicbir sey cizmez. */
  src: string | null | undefined;
  /**
   * Logo kutusu icin ek cumle: logo, kapagi olmayan HER sayfanin paylasim
   * gorseli oluyor ve bu bugune kadar panelde hic soylenmiyordu.
   */
  not?: string;
}

export default function SharePreview({ src, not }: SharePreviewProps) {
  const [durum, setDurum] = useState<
    { tip: "okunuyor" } | { tip: "hata" } | { tip: "hazir"; sonuc: PaylasimDegerlendirmesi }
  >({ tip: "okunuyor" });

  useEffect(() => {
    if (!src) return;
    let iptal = false;
    setDurum({ tip: "okunuyor" });

    gorselOlcusunuOku(src).then((olcu) => {
      if (iptal) return;
      setDurum(olcu ? { tip: "hazir", sonuc: degerlendir(olcu) } : { tip: "hata" });
    });

    // Gorsel degisirse onceki okumanin sonucu yeni gorselin uzerine yazmasin.
    return () => {
      iptal = true;
    };
  }, [src]);

  if (!src) return null;

  return (
    <div className="mt-3 rounded-lg border border-border bg-bg-light p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Share2 className="h-3.5 w-3.5 text-text-muted shrink-0" />
        <p className="text-xs font-medium text-text-dark">Paylaşıldığında böyle görünecek</p>
      </div>

      {/* 1,91:1 cerceve — object-cover BILEREK: paylasim robotlari da kirpar. */}
      <div className="relative w-full max-w-sm overflow-hidden rounded border border-border bg-white aspect-[1.91/1]">
        <SafeImage
          src={src}
          alt="Paylaşım önizlemesi"
          fill
          sizes="384px"
          className="object-cover"
          fallback={
            <div className="flex h-full w-full items-center justify-center text-xs text-text-muted">
              Görsel önizlenemiyor
            </div>
          }
        />
      </div>

      {durum.tip === "okunuyor" && (
        <p className="mt-2 text-xs text-text-muted">Ölçü okunuyor…</p>
      )}

      {durum.tip === "hata" && (
        <p className="mt-2 text-xs text-text-muted">
          Görselin ölçüsü okunamadı — paylaşımda nasıl görüneceğini gösteremiyoruz.
        </p>
      )}

      {durum.tip === "hazir" && (
        <>
          <p className="mt-2 text-xs text-text-muted">
            Yüklenen görsel: <span className="font-medium text-text-dark">{durum.sonuc.olcuMetni}</span>
          </p>

          {durum.sonuc.seviye === "ok" ? (
            <p className="mt-1.5 flex items-start gap-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>Paylaşım için uygun ölçüde.</span>
            </p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {durum.sonuc.uyarilar.map((uyari) => (
                <li key={uyari} className="flex items-start gap-1.5 text-xs text-warning">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                  <span>{uyari}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* 🔴 "Önerilen ..." satiri YALNIZ ise yarayacagi zaman cikar (21 Eylul
          2026). Her kutunun yaninda zaten ayni oneriyi veren bir yonlendirme
          metni var; gorsel zaten uygunken ikisini birden basmak ayni sayiyi
          iki kez soylemek olurdu. Uyari varken ya da olcu okunamamisken ise
          onerinin tam orada durmasi gerekiyor. */}
      {(durum.tip === "hata" || (durum.tip === "hazir" && durum.sonuc.seviye === "uyari")) && (
        <p className="mt-2 text-xs text-text-muted">
          Önerilen: {ONERILEN_GENISLIK}×{ONERILEN_YUKSEKLIK} piksel (yatay).
        </p>
      )}

      {not && <p className="mt-2 text-xs text-text-muted">{not}</p>}
    </div>
  );
}
