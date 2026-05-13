"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AdminError]", error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              Bir hata oluştu
            </h1>
            <p className="text-sm text-text-muted mt-3">
              Yönetim panelinde beklenmedik bir hata oluştu. Lütfen tekrar deneyin.
            </p>
            {isDev && error?.message && (
              <pre className="mt-4 rounded-lg bg-bg-light p-3 text-left text-xs text-text-muted whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            )}
          </div>

          <div className="space-y-2">
            <button
              onClick={reset}
              className="w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors"
            >
              Tekrar Dene
            </button>
            <Link
              href="/admin/giris"
              className="block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
            >
              Çıkış Yap ve Giriş Sayfasına Dön
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
