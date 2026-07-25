/**
 * Merkezi gorsel sikistirma + WebP donusumu (client-side, native Canvas).
 *
 * TEK KAYNAK: Tum yukleme yollari (kapak, slider, manset, galeri, editor)
 * bu util'i cagirir; boylece sistem genelinde tutarli boyutlandirma ve
 * WebP donusumu saglanir.
 *
 * GUVENLIK / DAYANIKLILIK (KRITIK):
 *  - Fallback: sikistirma/donusum basarisiz olursa VEYA sonuc orijinalden
 *    kucuk degilse, ORIJINAL dosya doner (kullanici asla takilmaz).
 *  - Bağımlılık YOK: tarayicinin native Canvas.toBlob'u kullanilir. Tarayici
 *    WebP encode desteklemezse toBlob null doner → orijinal dosya (fallback).
 *  - GIF/SVG dokunulmaz (animasyon/vektor bozulmasin).
 *  - Piksel siniri icindeki gorsellerde bile WebP re-encode DENENIR; yalnizca
 *    sonuc daha kucukse kullanilir (gereksiz buyume olmaz).
 *
 * Logo/favicon icin `toWebp=false` verilir → giris formati korunur (PNG
 * seffafligi/keskinlik), yalnizca boyut siniri uygulanir; WebP zorlanmaz.
 */

export interface CompressOptions {
  /** Maksimum genislik (px). Verilmezse sinirsiz. */
  maxWidth?: number;
  /** Maksimum yukseklik (px). Verilmezse sinirsiz. */
  maxHeight?: number;
  /** JPEG/WebP kalitesi (0..1). PNG ciktida yok sayilir. Default 0.85. */
  quality?: number;
  /** true: cikti WebP. false: giris formati korunur (logo/favicon). Default true. */
  toWebp?: boolean;
}

/** Dosya adinin uzantisini degistirir (uzanti yoksa ekler). */
function replaceExtension(name: string, ext: string): string {
  const base = name.replace(/\.[^./\\]+$/, "");
  return `${base}.${ext}`;
}

/** File'i <img>'e yukler; ObjectURL sizintisini onler. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Görsel okunamadı."));
    };
    img.src = url;
  });
}

export async function compressImage(
  file: File,
  options: CompressOptions = {}
): Promise<File> {
  const {
    maxWidth = Infinity,
    maxHeight = Infinity,
    quality = 0.85,
    toWebp = true,
  } = options;

  // Gorsel degilse veya format-korumali tipler: dokunma
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  try {
    const img = await loadImage(file);

    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;

    // Yalnizca sinir asiliyorsa kucult (asla buyutme)
    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file; // context alinamadi → fallback
    ctx.drawImage(img, 0, 0, width, height);

    // Cikti format + uzanti
    let mime: string;
    let ext: string;
    if (toWebp) {
      mime = "image/webp";
      ext = "webp";
    } else if (file.type === "image/jpeg") {
      mime = "image/jpeg";
      ext = "jpg";
    } else {
      // PNG ve diger tipler → PNG (seffaflik korunur; logo/favicon guvenli)
      mime = "image/png";
      ext = "png";
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(
        (b) => resolve(b),
        mime,
        mime === "image/png" ? undefined : quality
      )
    );

    // Fallback: blob yok VEYA fayda yok (orijinalden kucuk degil) → orijinal
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], replaceExtension(file.name, ext), { type: mime });
  } catch {
    // Herhangi bir hata → orijinal dosya (kullanici takilmasin)
    return file;
  }
}
