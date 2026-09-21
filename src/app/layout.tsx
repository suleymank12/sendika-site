import type { Metadata } from "next";
import { headers } from "next/headers";
import { resolveCurrentTenant } from "@/lib/get-tenant";
import { getSiteSettings } from "@/lib/site-settings";
import { buildTenantPublicUrl } from "@/lib/tenant-url";
import { pickOgImage } from "@/lib/og-image";
import { isSuperAdminHost } from "@/lib/tenant-hostname";
import HydrationFlag from "@/components/HydrationFlag";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  // SUPER ADMIN HOST'U — kurum HIC cozulmez (19 Eylul 2026).
  //
  // Bu host bir kuruma ait degil; `getCurrentTenantOrNull()` slug
  // bulamayip DEFAULT kuruma duserdi ve panelin sekme basligi/favicon'u
  // default kurumun markasi olurdu. Panel host'u HICBIR musteri markasi
  // tasimamali — giris sayfasinin notr olmasinin ayni gerekcesi.
  //
  // Yan fayda: bu dalda site_settings sorgusu da atilmiyor.
  if (isSuperAdminHost(headers().get("host") || "")) {
    return {
      title: "Platform Yönetimi",
      description: "Platform yönetim paneli.",
      robots: { index: false, follow: false },
    };
  }

  // Default'a DUSMEYEN surum (b3 / Asama 0). Root layout HER rotayi sarar —
  // `/admin/tenant-bulunamadi` dahil. Burada default'a dusulurse o hata
  // sayfasi default kurumun basligiyla acilir; daha kotusu, cozulemeyen bir
  // host'ta sanki gecerli bir siteymis gibi metadata uretilir.
  const cozum = await resolveCurrentTenant();

  // K6 — BASLIK YOK (21 Eylul 2026): istek middleware'den GECMEDI. Bugun
  // tek ornegi matcher disinda OLMAYAN bir dosya (`/_next/static/yok.js`):
  // Next'in 404'u burada, hicbir kurumu bilmeden render ediliyor. HICBIR
  // kurumun adi, aciklamasi, og'si, favicon'u basilmaz; `metadataBase` yok.
  //
  // "Site Bulunamadı" DEGIL: site pekala var (kurmayteknoloji.com) — bulunamayan
  // istenen adres. Govde zaten root `not-found.tsx` ("Sayfa Bulunamadı",
  // platform paleti, "/"a donus linki — ayni host, dogru kurum).
  if (cozum.kind === "no-header") {
    return {
      title: "Sayfa Bulunamadı",
      robots: { index: false, follow: false },
    };
  }

  const tenant = cozum.kind === "found" ? cozum.tenant : null;

  // Tenant cozulemedi: notr baslik + noindex. `metadataBase` verilmez —
  // hangi host'un kanonik oldugu belli degil.
  if (!tenant) {
    return {
      title: "Site Bulunamadı",
      description: "Bu adrese tanımlı bir site bulunmuyor.",
      robots: { index: false, follow: false },
    };
  }

  // Pasif tenant: notr baslik + noindex (arama motorlari indekslemesin)
  if (!tenant.is_active) {
    return {
      title: "Site Kapalı",
      description: "Bu site şu anda hizmet vermemektedir.",
      robots: { index: false, follow: false },
    };
  }

  // cache()'li ortak yardimci: (public) layout ayni istekte ayni map'i
  // kullaniyor, DB'ye tek sorgu gidiyor. (Eskiden burada 3 key'lik ayri
  // bir sorgu vardi.)
  const map = await getSiteSettings(tenant.id);

  const title = map.site_title || tenant.name || "Sendika Adı";
  const description = map.site_description || `${title} Kurumsal Web Sitesi`;
  // Önce site_settings'teki favicon, sonra tenant.favicon_url
  const faviconUrl = map.favicon_url || tenant.favicon_url || undefined;

  return {
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description,
    // Tenant-aware taban: canonical/og:url relative verilir, buradan
    // absolute'a cozulur. buildTenantPublicUrl custom_domain > subdomain >
    // apex onceligiyle sitemap.ts ile AYNI host'u uretir (eskiden tek sabit
    // NEXT_PUBLIC_SITE_URL idi — tum tenant'lar apex'e cozuluyordu).
    // Fallback tekillestirildi: env yoksa tenant-url.ts'in lvh.me dev
    // fallback'i gecerli (buradaki ayri sendika.org.tr fallback'i kalkti).
    metadataBase: new URL(buildTenantPublicUrl(tenant)),
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: title,
      // Paylasim gorseli AGI: bu blok yalniz `openGraph` TANIMLAMAYAN
      // sayfalara miras kalir (Next'in metadata merge'u shallow —
      // lib/seo.ts basligi). Public sayfalarin hepsi buildPublicMetadata'dan
      // geciyor ve zinciri kendi kuruyor; buradaki satir, yarin o
      // yardimciyi kullanmayi unutan bir sayfanin da kurumun KENDI
      // logosuyla paylasilmasini saglar. Sentinel/goreli deger elenir.
      ...(() => {
        const logo = pickOgImage(map.logo_url);
        return logo ? { images: [{ url: logo, alt: title }] } : {};
      })(),
    },
    // Sayfa bazinda twitter tanimi yok — bu default tum public sayfalara
    // miras kalir; twitter:image/title og taglerinden okunur.
    twitter: {
      card: "summary_large_image",
    },
    ...(faviconUrl && {
      icons: {
        icon: faviconUrl,
        shortcut: faviconUrl,
        apple: faviconUrl,
      },
    }),
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased" suppressHydrationWarning>
        <div id="initial-loading-bar" aria-hidden />
        <HydrationFlag />
        {children}
      </body>
    </html>
  );
}
