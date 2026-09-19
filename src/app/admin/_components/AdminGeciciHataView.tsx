"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Geçici sorun" ekranı (20 Eylül 2026).
 *
 * NEDEN VAR: üyelik sorgusu HATA verdiğinde kullanıcıya "bu kurumda
 * yetkiniz yok" deniyordu. Yanlış cümle — yetkisi olabilir, sadece sorgu
 * cevap vermedi (Supabase kesintisi, ağ, geçici RLS/bağlantı hatası).
 * Üstelik o ekranın tek çıkışı "Çıkış Yap"tı; yani geçici bir aksaklık
 * kullanıcıyı oturumundan ediyordu.
 *
 * 🔴 FAIL-CLOSED: bu ekran panelin YERİNE gösteriliyor, panel açılmıyor.
 * Değişen tek şey yazı ve "Tekrar Dene" yolu.
 *
 * `router.refresh()` sunucu bileşenlerini yeniden çalıştırır — sorgu bu
 * sefer başarılı olursa panel kendiliğinden açılır, kullanıcı hiçbir şey
 * yapmak zorunda kalmaz.
 */
export default function AdminGeciciHataView() {
  const router = useRouter();
  const [deneniyor, setDeneniyor] = useState(false);

  const handleRetry = () => {
    setDeneniyor(true);
    router.refresh();
    // refresh() bir söz döndürmüyor; düğme kısa süre "deneniyor" kalsın ki
    // kullanıcı tıklamanın işlediğini görsün.
    window.setTimeout(() => setDeneniyor(false), 1500);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              Geçici Bir Sorun Oluştu
            </h1>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              Yetkileriniz şu anda kontrol edilemedi. Bu genellikle kısa süreli
              bir bağlantı sorunudur — hesabınızla ilgili bir problem değil.
              Birkaç saniye sonra tekrar deneyin.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleRetry}
              disabled={deneniyor}
              className="w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {deneniyor ? "Deneniyor..." : "Tekrar Dene"}
            </button>
            <Link
              href="/"
              className="block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
            >
              Ana Sayfaya Dön
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
