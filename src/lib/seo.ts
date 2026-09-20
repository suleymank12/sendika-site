import { getCurrentTenant } from "@/lib/get-tenant";
import { getSiteSettings } from "@/lib/site-settings";
import { pickOgImage } from "@/lib/og-image";
import type { Metadata } from "next";

/**
 * Public sayfa metadata uretici (b6 Asama 2).
 *
 * Next.js metadata merge'u SHALLOW'dur: sayfa `openGraph` tanimlarsa root
 * layout'un openGraph'i (locale/siteName dahil) TAMAMEN ezilir. Bu helper
 * o alanlari her sayfada yeniden kurarak kaybi onler — sayfalar og objesini
 * elle yazmamali, buradan gecmeli.
 *
 * canonical + og:url RELATIVE verilir; root layout'taki tenant-aware
 * metadataBase (buildTenantPublicUrl) absolute'a cevirir. Boylece
 * custom_domain'li tenant'ta canonical custom domain'i, subdomain
 * tenant'inda {slug}.{apex}'i gosterir — sitemap ile ayni kaynak.
 *
 * getCurrentTenant + getSiteSettings cache()'li: root layout ayni istekte
 * zaten cagiriyor, buradaki cagrilar DB'ye ek sorgu URETMEZ.
 */
interface PublicMetadataInput {
  /** Site-goreli path ("/haberler/slug"). Query da tasinabilir ("?sayfa=2"). */
  path: string;
  /** Sayfa basligi. Verilmezse root default (site basligi) miras kalir. */
  title?: string;
  /** Meta description. Verilmezse: title varsa "title — siteName", yoksa site aciklamasi. */
  description?: string;
  /**
   * Icerigin KENDI kapak gorseli (Storage adresi). Verilmezse ya da
   * kullanilamazsa kurumun logosuna dusulur (bkz. asagidaki zincir).
   *
   * Adres `lib/og-image.ts`'ten gecer: Storage adresleri Next'in gorsel
   * ucuna alinir (2.7 MB -> ~150 KB, webp -> jpeg; olculdu), sentinel ve
   * goreli degerler elenir.
   *
   * width/height BILEREK verilmiyor: gorsel ucu kirpmadigi icin yukseklik
   * icerigin oranina gore degisiyor ve DB'de boyut yok; yanlis beyan hic
   * vermemekten kotu. alt olarak sayfa basligi kullanilir.
   */
  image?: string | null;
  /** Haber/duyuru detayi: og:type article + tarih alanlari (ISO string). */
  article?: {
    publishedTime?: string | null;
    modifiedTime?: string | null;
  };
}

export async function buildPublicMetadata(
  input: PublicMetadataInput
): Promise<Metadata> {
  const tenant = await getCurrentTenant();
  const map = await getSiteSettings(tenant.id);

  // Fallback zinciri root layout generateMetadata ile SENKRON tutulmali.
  const siteName = map.site_title || tenant.name || "Sendika Adı";
  const ogTitle = input.title || siteName;
  const description =
    input.description ||
    (input.title
      ? `${input.title} — ${siteName}`
      : map.site_description || `${siteName} Kurumsal Web Sitesi`);

  // 🔴 PAYLASIM GORSELI ZINCIRI — hepsi BU kurumun verisinden.
  //    1. icerigin kendi kapagi  2. kurumun logosu  3. hicbiri -> etiket yok
  //    Platform geneli sabit bir varsayilan YOK (beyaz etiket: musterinin
  //    linkinde baska bir kurumun markasi cikamaz). Logo degeri sentinel
  //    ("/placeholder-logo.png") ya da goreli ise elenir — o dosya repoda
  //    YOK, yazilsa 404 onizleme uretirdi (bkz. lib/og-image.ts).
  const ogImage = pickOgImage(input.image, map.logo_url);

  const shared = {
    locale: "tr_TR",
    siteName,
    url: input.path,
    title: ogTitle,
    description,
    ...(ogImage && { images: [{ url: ogImage, alt: ogTitle }] }),
  };

  const openGraph: NonNullable<Metadata["openGraph"]> = input.article
    ? {
        ...shared,
        type: "article",
        publishedTime: input.article.publishedTime || undefined,
        modifiedTime: input.article.modifiedTime || undefined,
      }
    : { ...shared, type: "website" };

  return {
    ...(input.title && { title: input.title }),
    description,
    alternates: { canonical: input.path },
    openGraph,
  };
}
