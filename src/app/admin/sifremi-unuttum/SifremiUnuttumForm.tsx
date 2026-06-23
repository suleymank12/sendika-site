"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SifremiUnuttumForm({ initialTitle }: { initialTitle: string }) {
  const [title] = useState(initialTitle);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createClient();
    const redirectUrl = `${window.location.origin}/admin/davet-kabul`;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: redirectUrl }
    );

    setLoading(false);

    if (resetError) {
      console.error("[SifremiUnuttum] resetPasswordForEmail hatası:", resetError);
      setError("İşlem başarısız: " + resetError.message);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
            <div className="text-center mb-6">
              <p className="text-sm font-medium text-primary">{title}</p>
              <h1 className="text-2xl font-bold text-text-dark tracking-tight mt-1">
                Mailinizi Kontrol Edin
              </h1>
              <p className="text-sm text-text-muted mt-3 leading-relaxed">
                Eğer bu e-posta sistemde kayıtlıysa, şifre sıfırlama linki
                gönderildi. Lütfen e-posta kutunuzu (ve gerekirse spam
                klasörünüzü) kontrol edin.
              </p>
            </div>
            <Link
              href="/admin/giris"
              className="block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
            >
              Giriş Sayfasına Dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-primary">{title}</p>
            <h1 className="text-2xl font-bold text-text-dark tracking-tight mt-1">
              Şifremi Unuttum
            </h1>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              E-posta adresinizi girin. Şifrenizi sıfırlamak için bir bağlantı
              göndereceğiz.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-text-dark mb-1"
              >
                E-posta
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-posta adresinizi girin"
                required
                disabled={loading}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-bg-light"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Gönderiliyor..." : "Sıfırlama Linki Gönder"}
            </button>
          </form>

          <div className="mt-4 text-center">
            <Link
              href="/admin/giris"
              className="text-xs text-text-muted hover:text-primary transition-colors"
            >
              Giriş sayfasına dön
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
