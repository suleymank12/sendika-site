import type { Metadata } from "next";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getSiteSettings } from "@/lib/site-settings";
import { buildTenantPublicUrl } from "@/lib/tenant-url";
import HydrationFlag from "@/components/HydrationFlag";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getCurrentTenant();

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
