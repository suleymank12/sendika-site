"use client";

import { NOTR_HATA_METNI } from "@/lib/notr-hata";
import "./globals.css";

/**
 * EN UST HATA SINIRI — kok layout'un kendisi (ya da metadata'si) hata verirse
 * (C7, 24 Eylul 2026). Kok layout'un YERINE render edilir; bu yuzden kendi
 * <html>/<body>'sini ve stil dosyasini kendisi getirir. Kurum adi, marka,
 * hata ayrintisi YOK — app/error.tsx ile ayni metin.
 */
export default function EnUstHataSiniri({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="tr">
      <head>
        <title>Geçici sorun</title>
        <meta name="robots" content="noindex" />
      </head>
      <body className="antialiased">
        <div data-sinir="global" className="flex min-h-screen items-center justify-center bg-bg-light px-4">
          <div className="max-w-md text-center">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">{NOTR_HATA_METNI}</h1>
            <button
              type="button"
              onClick={() => reset()}
              className="mt-6 inline-block rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-white hover:bg-primary-dark transition-colors"
            >
              Tekrar Dene
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
