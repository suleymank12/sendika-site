import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { isNextImageSafeUrl } from "@/lib/utils";

/**
 * next/image'in guvenli sarmalayicisi (bozuk src DoS'u).
 *
 * SORUN: next/image tanimadigi bir src ile RENDER SIRASINDA hata firlatir
 * ("Failed to parse src", "hostname is not configured") ve sayfayi 500'e
 * dusurur. Kolonlar (cover_image, photo, logo_url, image_url ...) tenant
 * admin tarafindan doldruluyor; birine "x" yazan biri kendi tenant'inin
 * anasayfasini/listelerini cokertebiliyordu. React render hatasi try/catch
 * ile YAKALANAMAZ — tek cozum next/image'i hic cagirmamak.
 *
 * Bu bileşen DIREKTIFSIZ (universal): tuketiciler karisik (NewsCard server,
 * GalleryGrid client). "use client" koymak server sayfalari gereksiz yere
 * client bundle'a iter; "server-only" koymak client tuketicileri kirar.
 * isNextImageSafeUrl @/lib/utils icinde ve o dosya server-only hicbir sey
 * import etmiyor — bilincli bir kisit.
 *
 * PROP DUSMEZLIGI: proplar tek tek sayilmaz; Omit<ImageProps,"src"> ile
 * next/image'in kendi tipi devralinir ve ...rest spread edilir. Boylece
 * bugun kullanilan (fill, sizes, priority, unoptimized, draggable, onClick,
 * onLoad, width, height, className) ve yarin eklenecek her prop otomatik
 * gecer; biri unutulup sessizce dusemez.
 *
 * FALLBACK: her kartin kendi "gorsel yok" gorunumu farkli oldugu icin
 * placeholder BURAYA GOMULMEZ — cagiran taraf gecer. Boylece "bozuk src"
 * ile "gorsel yok" birebir ayni gorunur.
 */
type SafeImageProps = Omit<ImageProps, "src"> & {
  /** next/image'dan farkli olarak null/undefined kabul eder. */
  src: string | null | undefined;
  /** src gecersizse render edilir. Verilmezse hicbir sey cizilmez. */
  fallback?: ReactNode;
};

export default function SafeImage({ src, fallback = null, ...rest }: SafeImageProps) {
  // isNextImageSafeUrl bir type predicate (url is string) — narrowing sayesinde
  // asagidaki src prop'u string olarak gecer.
  if (!isNextImageSafeUrl(src)) return <>{fallback}</>;
  // jsx-a11y alt'i ...rest icinde goremiyor (false positive). alt ZORUNLU
  // kalmaya devam ediyor: SafeImageProps, ImageProps'tan devraldigi icin
  // alt'siz her cagri yeri DERLEME hatasi verir.
  // eslint-disable-next-line jsx-a11y/alt-text
  return <Image src={src} {...rest} />;
}
