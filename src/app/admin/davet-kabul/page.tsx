"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildTenantAdminUrl } from "@/lib/tenant-hostname";
import {
  INVITE_TENANT_PARAM,
  chooseInviteTenant,
  describeAuthLinkError,
  parseAuthLink,
  parseAuthLinkError,
  parseInviteTenantId,
  type AuthLinkError,
  type AuthLinkMode,
} from "@/lib/super-admin/admin-invite";

type Status = "loading" | "invalid" | "ready" | "saving";
type Mode = AuthLinkMode;

// Recovery mode kalicilik bayragi: PKCE ?code URL'den temizlendikten sonra
// sayfa yenilenirse mode kaybolmasin diye sessionStorage'da tutulur.
const RECOVERY_FLAG_KEY = "davet-kabul-recovery";

// Davet linkinin kurumu (?tenant=<uuid>): replaceState URL'i temizledikten
// sonra sayfa yenilenirse kaybolmasin diye sessionStorage'da tutulur.
const INVITE_TENANT_KEY = "davet-kabul-tenant";

/**
 * Gecersiz davet ekranindaki buton. `pending` iken href'siz, tiklanamayan bir
 * span'dir: kurumun adresi henuz okunmadan apex'e gidilemesin. Etiket ve
 * yerlesim ayni kalir (birkac yuz ms'lik bekleme icin yazi degismez, sayfa
 * ziplamaz); yalniz soluklasir, imlec kapsayicida "bekle" olur.
 */
function PendingLink({
  href,
  pending,
  className,
  children,
}: {
  href: string;
  pending: boolean;
  className: string;
  children: ReactNode;
}) {
  if (pending) {
    return (
      <span aria-disabled="true" className={`${className} pointer-events-none opacity-60`}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function DavetKabulPage() {
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<Mode>("invite");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [formError, setFormError] = useState("");
  // Davet linkinin tasidigi kurum (dogrulanmis UUID) — yoksa null.
  const [inviteTenantId, setInviteTenantId] = useState<string | null>(null);
  // Supabase linki reddettiyse (#error=...) hatanin kodu/akisi — yoksa null.
  const [linkError, setLinkError] = useState<AuthLinkError | null>(null);
  // Gecersiz davet ekraninda kurumun KENDI adresindeki giris / sifremi
  // unuttum baglantilari — okunamazsa goreli baglantilar kullanilir.
  const [tenantLinks, setTenantLinks] = useState<{ login: string; forgot: string } | null>(
    null
  );
  // Kurum adresi okunurken true — butonlar tiklanamaz (bkz. PendingLink).
  const [tenantLinksPending, setTenantLinksPending] = useState(false);
  // 🔴 STRICTMODE KİLİDİ — `verifyOtp` ÖMÜRDE BİR KEZ çağrılsın diye.
  // Gerekçesi aşağıda, token_hash dalının içinde.
  const verifyStartedRef = useRef(false);

  useEffect(() => {
    /**
     * "Geçersiz" ekranındaki "Şifremi Unuttum" / "Giriş Sayfasına Git"
     * bağlantılarını kurumun KENDİ adresine çevirir.
     *
     * NEDEN: bu sayfa apex'te (SITE_URL) açılır; apex'te giriş yapan kurum
     * admini "Yetkisiz Erişim"e düşer (apex = default kurum). `tenants`
     * anon'a açık (tenants_public_select); okunamazsa göreli bağlantılar
     * kalır.
     *
     * İKİ YERDEN ÇAĞRILIR (20 Eylül 2026, P3):
     *  - Supabase linki reddettiyse (`#error=`) — davet ESKİ biçimdeyken
     *    ({{ .ConfirmationURL }}) hata böyle gelirdi;
     *  - `verifyOtp` reddettiyse — davet token_hash'e taşındıktan sonra
     *    kullanılmış/süresi dolmuş davet linki ARTIK bu yoldan geliyor.
     *    Fonksiyon ortaklaştırılmasaydı yeni yolda butonlar apex'e
     *    gidecekti: 19 Eylül'de kapatılan arızanın sessiz geri dönüşü.
     */
    const loadTenantLinks = (tenantId: string) => {
      // Sorgu sürerken butonlar tıklanamaz: göreli yol apex'tir ve hızlı
      // tıklayan kurum admini oraya gidip "Yetkisiz Erişim"e düşerdi. Göreli
      // yola YALNIZCA sorgu başarısız olursa (hata / satır yok / 5 sn yanıt
      // yok) düşülür; geç gelen yanıt doğru adresi yine yazar.
      setTenantLinksPending(true);
      const fallback = window.setTimeout(() => setTenantLinksPending(false), 5000);
      const done = () => {
        window.clearTimeout(fallback);
        setTenantLinksPending(false);
      };
      createClient()
        .from("tenants")
        .select("slug, custom_domain")
        .eq("id", tenantId)
        .maybeSingle()
        .then(({ data }) => {
          if (data?.slug) {
            const base = buildTenantAdminUrl(data.slug, data.custom_domain);
            setTenantLinks({ login: `${base}/giris`, forgot: `${base}/sifremi-unuttum` });
          }
          done();
        }, done);
    };

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

    // 2a) Supabase linki REDDETTIYSE (kullanilmis / suresi dolmus token) donus
    //     adresine hata ekler: ?tenant=<uuid>#error=access_denied&error_code=
    //     otp_expired&... Bu durumda "Gecersiz" ekrani gosterilir ve tarayicidaki
    //     mevcut oturuma DUSULMEZ. auth-js URL hatasinda oturumu bilerek
    //     silmiyor; eskiden asagidaki getSession() o oturumu bulup gecersiz
    //     linke sifre formu gosteriyordu — oturumdaki kisinin sifresi degisiyordu
    //     (10 Eylul 2026 yan bulgusu). Hata hash'te + query'de = PKCE = sifre
    //     sifirlama linki; yalniz hash'te = davet linki.
    const linkErr = parseAuthLinkError(window.location.hash, window.location.search);
    if (linkErr) {
      const errMode: Mode = linkErr.flow === "pkce" ? "recovery" : "invite";
      setMode(errMode);
      setLinkError(linkErr);
      try {
        // Bu linkle devam edilmeyecek — onceki yuklemelerden kalan bayraklar
        // sonraki bir linki etkilemesin.
        sessionStorage.removeItem(RECOVERY_FLAG_KEY);
        sessionStorage.removeItem(INVITE_TENANT_KEY);
      } catch {
        // sessionStorage kapali olabilir
      }

      // Davet linkiyse "Giris" / "Sifremi Unuttum" kurumun KENDI adresine
      // gitsin: bu sayfa apex'te (SITE_URL) acilir, apex'te giris yapan kurum
      // admini ise "Yetkisiz Erisim"e duser (apex = default kurum). tenants
      // anon'a acik (tenants_public_select); okunamazsa goreli baglantilar kalir.
      const errTenant = parseInviteTenantId(
        new URLSearchParams(window.location.search).get(INVITE_TENANT_PARAM)
      );
      if (errMode === "invite" && errTenant) {
        loadTenantLinks(errTenant);
      }

      setStatus("invalid");
      return;
    }

    // 2) YENİ AKIŞ — şablon jetonu taşıyor: ?token_hash=<hash>&type=recovery
    //    (20 Eylül 2026, P1). Link ARTIK Supabase'in /verify ucuna değil
    //    doğrudan bu sayfaya geliyor; doğrulama buradan POST ile yapılıyor.
    //    Kazanç: (a) PKCE doğrulayıcısı gerekmediği için link HER tarayıcıda
    //    ve HER cihazda açılır — 19 Eylül canlı bug'ının kökü buydu;
    //    (b) linki otomatik açan mail tarayıcıları (Outlook Safe Links,
    //    kurumsal proxy) jetonu YAKMAZ, çünkü tüketim GET ile değil bu
    //    POST ile oluyor.
    //
    //    ⚠️ 20 Eylül 2026 / P3: sıfırlama (P2) ve DAVET (P3) şablonlarının
    //    ikisi de bu biçime taşındı — `type` linkte açıkça yazılı, mod artık
    //    tahmin edilmiyor. Davet için ölçüldü (service_role, mail gitmeden):
    //      generate_link type=invite → hashed_token 56 hex, `pkce_` öneki YOK
    //      POST /verify {token_hash, type:"invite"} → 200, oturum GELDİ
    //      aynı jeton ikinci kez → 403 otp_expired (tek kullanımlık)
    //      ayrıca: bir sonraki generate_link öncekini ÖLDÜRÜR (jeton yenilenir)
    //    `{{ .RedirectTo }}` davet için `?tenant=<uuid>`'yi BİREBİR koruyor —
    //    bu yüzden şablonda birleştirici `&` (bkz. AUTH_LINK_JOINER).
    const link = parseAuthLink(window.location.search, window.location.hash);
    if (link.route === "token_hash") {
      // 🔴 ÖNLEM 1 — TEK ÇAĞRI KİLİDİ. `reactStrictMode` açık (Next 14
      //    varsayılanı, next.config.mjs'de kapatılmamış): geliştirmede
      //    effect iki kez koşar. İkinci `verifyOtp` jetonu bulamaz
      //    ("otp_expired") ve kullanıcıya SAHTE bir "geçersiz" ekranı
      //    gösterirdi — yani bu hafta kovaladığımız hatanın birebir
      //    kopyası. Ref aynı mount'ta yaşar, ikinci koşuyu keser.
      if (verifyStartedRef.current) return;
      verifyStartedRef.current = true;

      setMode(link.mode);

      // Mod kalıcılığı — jeton birazdan URL'den silinecek; sayfa yenilenirse
      // ikinci yüklemede linkten okunacak bir şey KALMAZ ve mod varsayılana
      // ("invite") düşerdi: sıfırlama yapan kişi davet metnini görür,
      // "Şifreyi Belirle" sonrası panele yönlendirilirdi. Bugünkü `?code`
      // akışının bayrağı burada da kullanılıyor (aşağıda `storedRecoveryFlag`
      // onu okuyor), davet gelirse bayrak TEMİZLENİYOR — aynı sekmede yarım
      // kalmış bir sıfırlamadan kalan bayrak daveti recovery sanmasın.
      try {
        if (link.mode === "recovery") {
          sessionStorage.setItem(RECOVERY_FLAG_KEY, "1");
        } else {
          sessionStorage.removeItem(RECOVERY_FLAG_KEY);
        }
      } catch {
        // sessionStorage kapali olabilir — state zaten set edildi
      }

      // Davet linkinin kurumu (?tenant=<uuid>). P3'te davet de bu yola
      // taşındı: link `...davet-kabul?tenant=<uuid>&token_hash=…&type=invite`
      // biçiminde geliyor (birleştirici `&` — bkz. AUTH_LINK_JOINER).
      //
      // replaceState (aşağıda) yalnız `token_hash` + `type`'ı siler, `?tenant=`
      // URL'de KALIR; yine de depoya yazılıyor ki replaceState engellenirse
      // ya da adres elle kısaltılırsa kurum kaybolmasın. Taze bir DAVET
      // linki kurum taşımıyorsa depodaki eski değer SİLİNİR — aynı sekmede
      // önceki bir davetten kalan kurum bu daveti yanlış yere yollamasın.
      // (Sıfırlama linki kurum taşımaz ve bu değeri kullanmaz; orada depoya
      // dokunulmuyor.)
      const linkTenant = parseInviteTenantId(
        new URLSearchParams(window.location.search).get(INVITE_TENANT_PARAM)
      );
      try {
        if (linkTenant) {
          sessionStorage.setItem(INVITE_TENANT_KEY, linkTenant);
        } else if (link.mode === "invite") {
          sessionStorage.removeItem(INVITE_TENANT_KEY);
        }
      } catch {
        // sessionStorage kapali olabilir — state zaten set ediliyor
      }
      setInviteTenantId(linkTenant);

      // 🔴 ÖNLEM 2 — JETONU URL'DEN SİL, doğrulamadan ÖNCE.
      //    İki işi var: (a) sayfa yenilenirse aynı tek-kullanımlık jetonla
      //    ikinci doğrulama denenip sahte "geçersiz" üretilmesin;
      //    (b) jeton tarayıcı geçmişinde ve aynı-origin Referer başlığında
      //    durmasın (replaceState mevcut geçmiş kaydının ÜSTÜNE yazar).
      //    Yalnız auth parametreleri silinir — `?tenant=` korunur.
      const cleaned = new URL(window.location.href);
      cleaned.searchParams.delete("token_hash");
      cleaned.searchParams.delete("type");
      window.history.replaceState(
        null,
        "",
        `${cleaned.pathname}${cleaned.search}${cleaned.hash}`
      );

      // 🔴 ÖNLEM 3 — oturum CEREZE yazılsın diye ssr istemcisi (mail
      //    tetikleyen PKCE'siz istemci DEĞİL): sonraki `updateUser` ve
      //    middleware bu oturumu görmek zorunda.
      const verifyLink = async () => {
        try {
          const { data, error } = await createClient().auth.verifyOtp({
            token_hash: link.tokenHash,
            type: link.mode,
          });

          if (error || !data.session) {
            console.error("[DavetKabul] verifyOtp hatası:", error);
            setLinkError({ code: error?.code ?? null, flow: "token_hash" });
            // Kullanılmış / süresi dolmuş DAVET linki artık bu yoldan geliyor
            // (P3 öncesi `#error=` dalından gelirdi). "Geçersiz" ekranındaki
            // iki buton kurumun kendi adresini göstermeli — yoksa kişi apex'te
            // giriş yapıp "Yetkisiz Erişim" görür.
            if (link.mode === "invite" && linkTenant) {
              loadTenantLinks(linkTenant);
            }
            setStatus("invalid");
            return;
          }

          setStatus("ready");
        } catch (err) {
          // Ağ/beklenmeyen hata — auth hatası değil, kod da gelmez.
          console.error("[DavetKabul] verifyOtp beklenmeyen hata:", err);
          setLinkError({ code: null, flow: "token_hash" });
          if (link.mode === "invite" && linkTenant) {
            loadTenantLinks(linkTenant);
          }
          setStatus("invalid");
        }
      };

      verifyLink();
      return;
    }

    // 2b) Davet linkinin kurumu (?tenant=<uuid>, bkz. buildInviteRedirectUrl).
    //     replaceState (asagida) URL'i path'e indirip query'yi de SILDIGI icin
    //     burada, ONCE okunur ve sessionStorage'a yazilir. Sayfa yenilenirse
    //     URL'de artik yoktur, depodan okunur. Taze bir davet linki (hash'te
    //     token) parametresizse depodaki eski deger SILINIR — ayni sekmede
    //     onceki bir davetten kalan kurum bu daveti yanlis yere yollamasin.
    const tenantFromUrl = parseInviteTenantId(
      new URLSearchParams(window.location.search).get(INVITE_TENANT_PARAM)
    );
    let requestedTenant = tenantFromUrl;
    try {
      if (tenantFromUrl) {
        sessionStorage.setItem(INVITE_TENANT_KEY, tenantFromUrl);
      } else if (accessToken) {
        sessionStorage.removeItem(INVITE_TENANT_KEY);
      } else {
        requestedTenant = parseInviteTenantId(sessionStorage.getItem(INVITE_TENANT_KEY));
      }
    } catch {
      // sessionStorage kapali olabilir — URL'deki degerle devam
    }
    setInviteTenantId(requestedTenant);

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
        sessionStorage.removeItem(INVITE_TENANT_KEY);
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

    // Hangi kuruma: davet linkinin kurumu (kişi ona gerçekten üyeyse), yoksa
    // EN SON eklenen üyelik — karar saf fonksiyonda (chooseInviteTenant).
    // Eskiden burada SIRALAMASIZ .limit(1) vardı: birden fazla kuruma üye
    // kişi davet edildiği kurum yerine rastgele birine düşebiliyordu.
    // Sorgu yalnızca kişinin KENDİ üyeliklerini döndürür (user_id filtresi +
    // RLS); linkteki kurum bu liste içinde aranır — hedefli üyelik kontrolü
    // ve created_at DESC yedeği tek istekte.
    const { data: memberships, error: linksError } = await supabase
      .from("tenant_users")
      .select("tenant_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (linksError) {
      console.error("[DavetKabul] tenant_users sorgusu hatası:", linksError);
      window.location.href = "/admin";
      return;
    }

    try {
      sessionStorage.removeItem(INVITE_TENANT_KEY);
    } catch {
      // sessionStorage kapali olabilir — deger zaten state'te
    }

    const choice = chooseInviteTenant(memberships ?? [], inviteTenantId);
    if (!choice) {
      console.warn("[DavetKabul] Kullanıcı herhangi bir tenant'a bağlı değil");
      window.location.href = "/admin/yetkisiz";
      return;
    }
    if (
      choice.source === "latest_membership" &&
      (choice.reason === "not_a_member" || (memberships?.length ?? 0) > 1)
    ) {
      console.warn(
        "[DavetKabul] Davet linkinin kurumu kullanılamadı, en son üyeliğe yönlendiriliyor:",
        choice.reason
      );
    }

    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .select("slug, custom_domain")
      .eq("id", choice.tenantId)
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
    const isRecovery = mode === "recovery";
    // Neden cümlesi: Supabase hatası geldiyse koduna göre (otp_expired =
    // "süresi dolmuş ya da kullanılmış"), gelmediyse (token/oturum yok) genel.
    const reason = linkError
      ? describeAuthLinkError(linkError.code)
      : isRecovery
        ? "Bu sıfırlama linki geçersiz veya süresi dolmuş."
        : "Bu davet linki geçersiz veya süresi dolmuş.";
    const primaryClass =
      "block w-full rounded-lg bg-primary text-white text-center px-4 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors";
    const secondaryClass =
      "block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors";

    return (
      <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
        <div className="w-full max-w-md">
          <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-text-dark tracking-tight">
                {isRecovery ? "Sıfırlama Linki Geçersiz" : "Davet Linki Geçersiz"}
              </h1>
              <p className="text-sm text-text-muted mt-3 leading-relaxed">
                {reason}{" "}
                {isRecovery
                  ? "Yeni bir sıfırlama talebi gönderin."
                  : "Şifrenizi daha önce belirlediyseniz giriş yapabilirsiniz. Belirlemediyseniz ya da hatırlamıyorsanız “Şifremi Unuttum” ile yeni bir bağlantı isteyin."}
              </p>
              {linkError?.code && (
                <p className="text-xs text-text-muted mt-3">Hata kodu: {linkError.code}</p>
              )}
            </div>
            {isRecovery ? (
              <Link href="/admin/sifremi-unuttum" className={secondaryClass}>
                Yeniden Dene
              </Link>
            ) : (
              <div
                className={`space-y-2 ${tenantLinksPending ? "cursor-wait" : ""}`}
                aria-busy={tenantLinksPending}
              >
                <PendingLink
                  href={tenantLinks?.forgot ?? "/admin/sifremi-unuttum"}
                  pending={tenantLinksPending}
                  className={primaryClass}
                >
                  Şifremi Unuttum
                </PendingLink>
                <PendingLink
                  href={tenantLinks?.login ?? "/admin/giris"}
                  pending={tenantLinksPending}
                  className={secondaryClass}
                >
                  Giriş Sayfasına Git
                </PendingLink>
              </div>
            )}
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
                name="new-password"
                type="password"
                autoComplete="new-password"
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
                name="new-password-confirm"
                type="password"
                autoComplete="new-password"
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
