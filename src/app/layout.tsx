import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Sendika Adı",
    template: "%s | Sendika Adı",
  },
  description: "Sendika Adı Kurumsal Web Sitesi",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://sendika.org.tr"),
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Sendika Adı",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="tr">
      <body className="antialiased">
        <div id="initial-loading-bar" aria-hidden />
        <script dangerouslySetInnerHTML={{ __html: `document.body.classList.add("hydrated")` }} />
        {children}
      </body>
    </html>
  );
}
