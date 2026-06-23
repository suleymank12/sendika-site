"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";

function isSafeNext(next: string | null): next is string {
  return !!next && next.startsWith("/") && !next.startsWith("//");
}

export default function AdminLoginForm({ initialTitle }: { initialTitle: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [title] = useState(initialTitle);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

      // Süper admin kontrolü — RPC hatasında sessizce false varsay
      let isSuperAdmin = false;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data, error: rpcError } = await supabase.rpc("is_super_admin", {
            user_id: user.id,
          });
          if (rpcError) {
            console.error("is_super_admin RPC hatası:", rpcError);
          } else {
            isSuperAdmin = data === true;
          }
        }
      } catch (rpcErr) {
        console.error("is_super_admin RPC hatası:", rpcErr);
      }

      // Yönlendirme: next varsa ve güvenliyse onu kullan; yoksa role'e göre
      const rawNext = searchParams.get("next");
      const next = isSafeNext(rawNext) ? rawNext : null;

      let target: string;
      if (next) {
        if (next.startsWith("/super-admin")) {
          target = isSuperAdmin ? next : "/admin";
        } else {
          target = next;
        }
      } else {
        target = isSuperAdmin ? "/super-admin" : "/admin";
      }

      router.push(target);
      router.refresh();
    } catch {
      setError("Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-primary tracking-tight">{title}</h1>
            <p className="text-sm text-text-muted mt-1">Yönetim Paneli</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              id="email"
              label="E-posta"
              type="email"
              placeholder="E-posta adresinizi girin"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="password"
              label="Şifre"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="flex justify-end -mt-2">
              <Link
                href="/admin/sifremi-unuttum"
                className="text-xs text-text-muted hover:text-primary transition-colors"
              >
                Şifremi Unuttum
              </Link>
            </div>

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
