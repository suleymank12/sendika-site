"use client";

import { NOTR_HATA_METNI } from "@/lib/notr-hata";

/**
 * KOK HATA SINIRI — notr (Supabase kesinti dayanikliligi C7, 24 Eylul 2026).
 *
 * Public tarafta veri okunamayinca (kurum ya da icerik) sayfa artik bos 200
 * ya da 404 DEGIL, bu sinira duser → 500. Neden (public)/error.tsx DEGIL:
 * o sinir (public)/layout'un ICINDE render edilir — kurumun navbar'i, logosu
 * ve renkleriyle. Bu sinir onun USTUNDE: kurum adi, marka, hata ayrintisi YOK.
 * (public)/layout'un kendi hatasi da (ayar/menu) buraya gelir.
 *
 * Admin'in `admin/(authenticated)/error.tsx`'i daha derinde; onun davranisi
 * DEGISMEZ. Admin/super admin layout'larinin kendi hatalari eskiden Next'in
 * varsayilan sayfasina dusuyordu, simdi bu notr sayfaya.
 *
 * Hata ayrintisi (`error.message`) sayfaya YAZILMAZ; sunucu log'unda.
 */
export default function KokHataSiniri({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div data-sinir="kok" className="flex min-h-screen items-center justify-center bg-bg-light px-4">
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
  );
}
