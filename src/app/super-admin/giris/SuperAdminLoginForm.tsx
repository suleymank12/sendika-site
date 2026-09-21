"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

/**
 * Platform yönetimi giriş formu (19 Eylül 2026).
 *
 * `AdminLoginForm`'un KOPYASI DEĞİL, kardeşi — farkları bilinçli:
 *  - Tenant'a HİÇ dokunmaz: site başlığı/logosu okunmaz, `site_settings`
 *    sorgusu yok. Bu host hiçbir müşteri markası taşımamalı (kimlik avı
 *    yüzeyi; `app/admin/layout.tsx` başlığındaki aynı gerekçe).
 *  - "Şifremi unuttum" YOK: süper adminin davet akışı yok (hesap
 *    `super_admins` tablosuna elle INSERT ile ekleniyor) ve şifre
 *    sıfırlama Supabase Dashboard'dan yapılıyor. Böylece yeni host için
 *    Supabase'e Redirect URL satırı EKLEMEK GEREKMİYOR.
 *  - `is_super_admin` RPC'si BURADA ÇAĞRILMAZ. Yetki kararı tek yerde:
 *    `(authenticated)/layout.tsx`. Yetkisiz kullanıcı giriş yapabilir ve
 *    orada "yetkiniz yok" ekranını görür — sessiz yönlendirme yok.
 *
 * `next` yalnız /super-admin altına gidebilir; başka bir yere sıçrama
 * tahtası olmasın (middleware de aynı kuralı uyguluyor).
 */
function safeNext(next: string | null): next is string {
  return !!next && next.startsWith("/super-admin") && !next.startsWith("//");
}

export default function SuperAdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Oturum zaman aşımı (hooks/useIdleTimeout.tsx) buraya
  // ?oturum=zaman-asimi ile yönlendirir.
  const idleExpired = searchParams.get("oturum") === "zaman-asimi";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError("E-posta veya şifre hatalı.");
        return;
      }

      const rawNext = searchParams.get("next");
      router.push(safeNext(rawNext) ? rawNext : "/super-admin");
      router.refresh();
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-border bg-white p-8 shadow-sm">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-3 w-fit rounded-full bg-gray-900 p-3">
              <ShieldCheck className="h-6 w-6 text-amber-400" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-text-dark">
              Platform Yönetimi
            </h1>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {idleExpired && (
              <div
                role="status"
                className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-text-dark"
              >
                Uzun süre işlem yapılmadığı için oturumunuz kapatıldı. Lütfen tekrar
                giriş yapın.
              </div>
            )}

            <Input
              id="email"
              name="email"
              label="E-posta"
              type="email"
              autoComplete="username"
              placeholder="E-posta adresinizi girin"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              name="password"
              label="Şifre"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            {error && (
              <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
                {error}
              </div>
            )}

            <Button type="submit" loading={loading} className="w-full">
              Giriş Yap
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
