"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildTenantAdminUrl } from "@/lib/tenant-hostname";

type Status = "loading" | "invalid" | "ready" | "saving";
type Mode = "invite" | "recovery";

// Recovery mode kalicilik bayragi: PKCE ?code URL'den temizlendikten sonra
// sayfa yenilenirse mode kaybolmasin diye sessionStorage'da tutulur.
const RECOVERY_FLAG_KEY = "davet-kabul-recovery";

export default function DavetKabulPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<Mode>("invite");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    // 1) Hash'ten parametreleri ÖNCE oku (Supabase temizlemeden önce)
    //    Implicit akis: DAVET linkleri boyle gelir (#access_token&type=invite),
    //    cunku davet server-side inviteUserByEmail ile baslar (PKCE verifier yok).
    const hash = window.location.hash.replace(/^#/, "");
    const hashParams = new URLSearchParams(hash);
    const t = hashParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");

    // 2) PKCE akisi (?code=...): SIFRE SIFIRLAMA linkleri boyle gelir, cunku
    //    resetPasswordForEmail TARAYICIDAN cagrilir ve client PKCE'dir.
    //    PKCE linkinde hash da type bilgisi de YOK — bu uygulamada ?code
    //    gorulmesi = recovery (tek tarayici-baslatmali PKCE akisi budur).
    const hasPkceCode = !!new URLSearchParams(window.location.search).get("code");

    let storedRecoveryFlag = false;
    try {
      storedRecoveryFlag = sessionStorage.getItem(RECOVERY_FLAG_KEY) === "1";
    } catch {
      // sessionStorage kapali olabilir — bayrak olmadan devam
    }

    if (t && t !== "recovery") {
      // Acikca invite (veya baska tip) hash linki: ayni sekmede yarim kalmis
      // bir recovery'den kalan bayrak daveti recovery sanmasin — temizle.
      try {
        sessionStorage.removeItem(RECOVERY_FLAG_KEY);
      } catch {
        // sessionStorage kapali olabilir
      }
    } else if (t === "recovery" || hasPkceCode || storedRecoveryFlag) {
      setMode("recovery");
      try {
        sessionStorage.setItem(RECOVERY_FLAG_KEY, "1");
      } catch {
        // sessionStorage kapali olabilir — state zaten set edildi
      }
    }

    const supabase = createClient();

    // 3) PKCE exchange'ini Supabase client OTOMATIK yapar (detectSessionInUrl
    //    default acik). Exchange, recovery akisinda PASSWORD_RECOVERY event'i
    //    yayinlar — abonelik exchange bitmeden (senkron) kuruldugu icin event
    //    kacirilmaz. ?code cikarimina ek, Supabase'in otoriter sinyali.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setMode("recovery");
        try {
          sessionStorage.setItem(RECOVERY_FLAG_KEY, "1");
        } catch {
          // sessionStorage kapali olabilir — state zaten set edildi
        }
      }
    });

    const initSession = async () => {
      // 4) Hash'te token varsa: manuel setSession (race condition'sız)
      if (accessToken && refreshToken) {
        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          console.error("[DavetKabul] setSession hatası:", error);
          setStatus("invalid");
          return;
        }

        if (!data.session) {
          console.error("[DavetKabul] setSession data.session null");
          setStatus("invalid");
          return;
        }

        // Hash'i temizle (sayfa yenilenirse token tekrar parse edilmesin)
        window.history.replaceState(null, "", window.location.pathname);
        setStatus("ready");
        return;
      }

      // 5) Hash'te token yoksa: session kontrol et. PKCE (?code) akisinde
      //    getSession, client'in otomatik exchange'inin bitmesini bekler —
      //    exchange basariliysa session burada hazirdir.
      const {
        data: { session },
        error: getSessionError,
      } = await supabase.auth.getSession();

      if (getSessionError) {
        console.error("[DavetKabul] getSession hatası:", getSessionError);
        setStatus("invalid");
        return;
      }

      if (!session) {
        setStatus("invalid");
        return;
      }

      // Kullanilmis PKCE code'unu URL'den temizle (sayfa yenilenirse ayni
      // tek-kullanimlik code ile tekrar exchange denenip hata uretmesin;
      // session zaten storage'da, mode sessionStorage bayraginda).
      if (hasPkceCode) {
        window.history.replaceState(null, "", window.location.pathname);
      }

      setStatus("ready");
    };

    initSession();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (password.length < 8) {
      setFormError("Şifre en az 8 karakter olmalı.");
      return;
    }
    if (password !== passwordConfirm) {
      setFormError("Şifreler eşleşmiyor.");
      return;
    }

    setStatus("saving");
    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      console.error("[DavetKabul] updateUser hatası:", updateError);
      setFormError("Şifre belirlenirken hata oluştu: " + updateError.message);
      setStatus("ready");
      return;
    }

    // Recovery (şifre sıfırlama): şifre değişti; kullanıcıyı PANELE sokMA.
    // Geçici recovery session'ı temizle + giriş sayfasına yönlendir.
    // NEDEN: Eski akış tenant_users'a bakıp tenant'a yönlendiriyordu; süper
    // admin'in (veya tenant_users kaydı olmayan herkesin) üyeliği olmadığı
    // için /admin/yetkisiz'e düşüyordu. Ayrıca recovery redirectTo apex
    // olabildiğinden tenant subdomain'ine yönlendirme cross-subdomain cookie
    // sorununa takılıyordu. Giriş'e yönlendirmek her iki sorunu da çözer;
    // AdminLoginForm kullanıcıyı rolüne göre doğru yere alır.
    if (mode === "recovery") {
      try {
        sessionStorage.removeItem(RECOVERY_FLAG_KEY);
      } catch {
        // sessionStorage kapali olabilir — bayrak zaten yazilamamistir
      }
      await supabase.auth.signOut();
      window.location.href = "/admin/giris?reset=success";
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("[DavetKabul] getUser hatası:", userError);
      setFormError(
        "Şifre belirlendi fakat kullanıcı bilgisi alınamadı. Lütfen giriş sayfasından deneyin."
      );
      setStatus("ready");
      return;
    }

    // Kullanıcının ilk tenant'ını bul
    const { data: links, error: linksError } = await supabase
      .from("tenant_users")
      .select("tenant_id")
      .eq("user_id", user.id)
      .limit(1);

    if (linksError) {
      console.error("[DavetKabul] tenant_users sorgusu hatası:", linksError);
      window.location.href = "/admin";
      return;
    }

    if (!links || links.length === 0) {
      console.warn("[DavetKabul] Kullanıcı herhangi bir tenant'a bağlı değil");
      window.location.href = "/admin/yetkisiz";
      return;
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("slug, custom_domain")
      .eq("id", links[0].tenant_id)
      .single();

    if (tenantError || !tenant?.slug) {
      console.error("[DavetKabul] Tenant slug çekilemedi:", tenantError);
      window.location.href = "/admin";
      return;
    }

    window.location.href = buildTenantAdminUrl(tenant.slug, tenant.custom_domain);
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
        <div className="text-sm text-text-muted">
          {mode === "recovery" ? "Sıfırlama bağlantısı doğrulanıyor..." : "Davet doğrulanıyor..."}
        </div>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-text-dark tracking-tight">
                {mode === "recovery"
                  ? "Sıfırlama Linki Geçersiz"
                  : "Davet Linki Geçersiz"}
              </h1>
              <p className="text-sm text-text-muted mt-3 leading-relaxed">
                {mode === "recovery"
                  ? "Bu sıfırlama linki geçersiz veya süresi dolmuş. Yeni bir sıfırlama talebi gönderin."
                  : "Bu davet linki geçersiz veya süresi dolmuş. Yetkili kişiden yeni bir davet talep edin."}
              </p>
            </div>
            <Link
              href={mode === "recovery" ? "/admin/sifremi-unuttum" : "/admin/giris"}
              className="block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
            >
              {mode === "recovery" ? "Yeniden Dene" : "Giriş Sayfasına Dön"}
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
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              {mode === "recovery" ? "Yeni Şifre Belirleyin" : "Şifrenizi Belirleyin"}
            </h1>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              {mode === "recovery"
                ? "Hesabınız için yeni bir şifre belirleyin. En az 8 karakter olmalıdır."
                : "Yönetim paneline erişmek için bir şifre belirleyin. En az 8 karakter olmalıdır."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-text-dark mb-1"
              >
                Yeni Şifre
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="En az 8 karakter"
                required
                minLength={8}
                disabled={status === "saving"}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-bg-light"
              />
            </div>
            <div>
              <label
                htmlFor="passwordConfirm"
                className="block text-sm font-medium text-text-dark mb-1"
              >
                Yeni Şifre (Tekrar)
              </label>
              <input
                id="passwordConfirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Şifreyi tekrar girin"
                required
                minLength={8}
                disabled={status === "saving"}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:bg-bg-light"
              />
            </div>

            {formError && (
              <div className="rounded-lg bg-error/10 px-4 py-3 text-sm text-error">
                {formError}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "saving"}
              className="w-full rounded-lg bg-primary text-white px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {status === "saving"
                ? "Kaydediliyor..."
                : mode === "recovery"
                ? "Şifreyi Güncelle"
                : "Şifreyi Belirle"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
