"use client";

import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function YetkisizPage() {
  const handleSignOut = async () => {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[YetkisizPage] signOut hatası:", error);
    }
    window.location.href = "/admin/giris";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              Yetkisiz Erişim
            </h1>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              Bu kuruluşun yönetim paneline erişim yetkiniz yok. Hesabınız bu
              kuruluşa bağlı değil.
            </p>
          </div>

          <div className="space-y-2">
            <button
              onClick={handleSignOut}
              className="w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Çıkış Yap
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
