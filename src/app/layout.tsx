import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data } = await supabase
    .from("site_settings")
    .select("key, value")
    .eq("tenant_id", tenant.id)
    .in("key", ["site_title", "site_description", "favicon_url"]);

  const map: Record<string, string> = {};
  data?.forEach((row: { key: string; value: string | null }) => {
    if (row.value) map[row.key] = row.value;
  });

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
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://sendika.org.tr"),
    openGraph: {
      type: "website",
      locale: "tr_TR",
      siteName: title,
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
        <script dangerouslySetInnerHTML={{ __html: `document.body.classList.add("hydrated")` }} />
        {children}
      </body>
    </html>
  );
}
