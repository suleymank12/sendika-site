"use client";

import { useEffect } from "react";

/**
 * Acilis spinner'ini kapatan hidrasyon sinyali.
 *
 * globals.css'te #initial-loading-bar tam ekran bir spinner overlay'i
 * (JS yuklenmeden once gorunur) ve `body.hydrated #initial-loading-bar`
 * kurali onu gizliyor. Bu bayragi eskiden root layout'taki inline
 * <script> basiyordu; CSP nonce yonetimini bir yer azaltmak icin buraya
 * tasindi (inline script kalmadi).
 *
 * NEDEN ROOT LAYOUT: #initial-loading-bar root layout'ta, yani admin ve
 * super-admin dahil HER sayfada var. PageLoader ise yalnizca
 * (public)/layout.tsx'te mount ediliyor — tek basina birakilsaydi admin
 * panelinde spinner ekranda asili kalirdi.
 *
 * PageLoader.tsx'teki ayni cagri bilincli olarak duruyor: classList.add
 * idempotent, rota degisiminde de calismasi zararsiz.
 */
export default function HydrationFlag() {
  useEffect(() => {
    document.body.classList.add("hydrated");
  }, []);

  return null;
}
