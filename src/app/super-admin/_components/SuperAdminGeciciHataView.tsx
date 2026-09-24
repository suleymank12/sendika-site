"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Süper admin paneli — "geçici sorun" ekranı (C8, 24 Eylül 2026).
 *
 * Oturum ya da `is_super_admin` yetkisi Supabase'e ulaşılamadığı için
 * DOĞRULANAMADIĞINDA gösterilir. Eskiden bu durumda "Bu panele erişim
 * yetkiniz yok." yazıyordu — yanlış teşhis; kullanıcı yetkili olabilir.
 *
 * 🔴 FAIL-CLOSED: panel (SuperAdminShell) açılmaz, menü yok. Tek yol
 * "Tekrar Dene" (`router.refresh()` sunucu bileşenlerini yeniden çalıştırır;
 * doğrulama bu sefer başarılı olursa panel kendiliğinden açılır).
 * Gerçek yetkisizlikte (rpc false) SuperAdminYetkisizView değişmedi.
 */
export default function SuperAdminGeciciHataView() {
  const router = useRouter();
  const [deneniyor, setDeneniyor] = useState(false);

  const handleRetry = () => {
    setDeneniyor(true);
    router.refresh();
    window.setTimeout(() => setDeneniyor(false), 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm border border-border text-center">
        <h1 className="text-2xl font-bold text-text-dark tracking-tight">Geçici Bir Sorun Oluştu</h1>
        <p className="text-sm text-text-muted mt-3 leading-relaxed">
          Yetkiniz şu anda kontrol edilemedi. Bu genellikle kısa süreli bir
          bağlantı sorunudur — hesabınızla ilgili bir problem değil. Birkaç
          saniye sonra tekrar deneyin.
        </p>
        <button
          onClick={handleRetry}
          disabled={deneniyor}
          className="mt-6 w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {deneniyor ? "Deneniyor..." : "Tekrar Dene"}
        </button>
      </div>
    </div>
  );
}
