import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseHostname } from "@/lib/tenant-hostname";
import { SUPER_ADMIN_LOGIN_PATH } from "@/lib/constants";

// ===========================================================================
// CSP (Guvenlik bulgusu Y2 / ikinci savunma katmani)
// ===========================================================================
/**
 * ROLLOUT ANAHTARI — enforce'a gecis TEK SATIR:
 *   true  -> Content-Security-Policy-Report-Only (ihlaller sadece konsola duser,
 *            hicbir sey bloklanmaz)
 *   false -> Content-Security-Policy (zorlayici)
 *
 * Enforce'a gecmeden ONCE saglanmasi gereken kriter NOTE.md'de yazili.
 * Kisaca: manuel test listesinin tamami konsolda tek bir [Report Only]
 * satiri uretmeden gecmeli.
 *
 * NOT: Next, nonce'u Report-Only header'indan DA okuyor (app-render.js),
 * yani nonce mekanizmasi bu asamada gercekten test edilmis olur.
 */
const CSP_REPORT_ONLY = false;

const CSP_HEADER_NAME = CSP_REPORT_ONLY
  ? "Content-Security-Policy-Report-Only"
  : "Content-Security-Policy";

/**
 * Istek basina CSP string'i uretir.
 *
 * Direktif gerekceleri:
 *  - script-src: Next'in inline bootstrap script'leri nonce ile gecer;
 *    'strict-dynamic' dinamik yuklenen chunk'lara guveni devreder.
 *    'unsafe-eval' YALNIZCA development'ta (Next HMR eval kullanir).
 *  - style-src 'unsafe-inline': KACINILMAZ. (public)/layout.tsx tenant
 *    rengini CSS degiskeni olarak style={{}} ile basiyor, Swiper runtime'da
 *    transform stili yaziyor, DetailPageLayout fontSize'i inline veriyor.
 *    fonts.googleapis.com ise globals.css'teki @import icin.
 *  - font-src gstatic: Inter font dosyalari oradan geliyor.
 *  - img-src blob:: image-compress.ts URL.createObjectURL ile onizleme yapiyor.
 *  - connect-src: client-side Supabase (PostgREST/Auth/Storage) cagrilari.
 *    wss:// BILEREK YOK — Realtime (.channel()) kullanilmiyor. Eklenirse
 *    wss://*.supabase.co da gerekir (bkz. NOTE.md).
 *  - frame-src: tek mesru iki embed (YouTube + Google Maps). branches.map_url
 *    artik KAYNAGINDA dogrulaniyor (utils.ts isSafeMapEmbedUrl — o kural bu
 *    satirla SENKRON kalmali); bu satir ikinci savunma katmani.
 *  - upgrade-insecure-requests BILEREK YOK: lokal http gelistirmeyi bozar,
 *    HTTPS zorlamasi Nginx'in isi (HSTS + redirect).
 */
function buildCsp(nonce: string): string {
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    "'strict-dynamic'",
    ...(process.env.NODE_ENV === "development" ? ["'unsafe-eval'"] : []),
  ].join(" ");

  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.supabase.co",
    "media-src 'self' https://*.supabase.co",
    "connect-src 'self' https://*.supabase.co",
    "frame-src https://www.youtube.com https://www.google.com",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join("; ");
}

/**
 * FAIL-CLOSED hedefi: custom_domain hicbir tenant'a cozulemediginde admin
 * yollarinin yonlendirildigi sayfa. ADMIN_PUBLIC_PATHS'e de ekli olmali,
 * aksi halde auth guard'i /admin/giris'e atar ve dongu olusur.
 */
const TENANT_ERROR_PATH = "/admin/tenant-bulunamadi";

/**
 * Super admin host'unda GIRIS gerektirmeyen yollar. `/super-admin/giris`
 * burada olmazsa oturumsuz kullanici kendi kendine yonlendirilir (dongu).
 */
const SUPER_ADMIN_PUBLIC_PATHS = [SUPER_ADMIN_LOGIN_PATH];

/** Host kurallarının cevabı — gövdesiz, markasız, sessiz. */
function notFound(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function middleware(request: NextRequest) {
  // Hostname'i parse et (DB'siz, senkron). Server Component'ler tenant'i
  // x-tenant-slug header'i üzerinden okuyacak.
  const hostname = request.headers.get("host") || "localhost:3000";
  const match = parseHostname(hostname);

  // pathname BURADA okunuyor (eskiden auth blogundan hemen once okunuyordu):
  // custom_domain cozulemedigi durumda admin yollarini auth islemlerinden
  // ONCE kesmek icin gerekli.
  const { pathname } = request.nextUrl;

  // ==========================================================================
  // KURAL (a) — SUPER ADMIN HOST'UNDA YALNIZ /super-admin AÇIK
  // ==========================================================================
  // (19 Eylül 2026) `superadminpanel.{kök}` host'u BİR KURUM DEĞİL. Orada
  // public site, /admin, robots.txt ve sitemap.xml dahil her şey kapalı.
  //
  // Neden gerekli: bu host `parseHostname`'de ayrı bir tip, ama tenant
  // çözümleyen katmanlar (root layout metadata, robots.ts, sitemap.ts)
  // slug bulamayınca DEFAULT kuruma düşüyor. Kural olmasaydı panel host'u
  // default kurumun sitesinin ikinci bir kopyasını servis ederdi.
  //
  // Neden 404, yönlendirme değil: yönlendirme "burada bir şey var" der.
  // 404 sessiz — host joker DNS ve joker sertifika altında olduğu için
  // DNS'ten de Certificate Transparency'den de sayılamıyor; bu obskürite
  // bedavaya korunuyor.
  //
  // Neden BURADA, auth/CSP kurulumundan ÖNCE: reddedilen istek için
  // Supabase istemcisi kurmak, nonce üretmek ve `auth.getUser()` çağırmak
  // tamamen boşa iş. Statik varlıklar (`/_next/static`, `/_next/image`)
  // ve `/api` zaten matcher'ın dışında — panel çalışmaya devam eder.
  //
  const superAdminHost = match.type === "super_admin";
  if (superAdminHost && !pathname.startsWith("/super-admin")) {
    return notFound();
  }

  // ==========================================================================
  // KURAL (b) — DİĞER HOST'LARDA /super-admin KAPALI  (Deploy 2)
  // ==========================================================================
  // Panel eskiden HER host'tan açılıyordu: apex, her kurum subdomain'i ve
  // her müşteri custom domain'i. Buradaki koruma yalnız oturuma bakıyordu,
  // host'a hiç bakmıyordu; süper adminlik ise KULLANICININ özelliği. Yani
  // süper admin paneli müşterinin kendi alan adından servis ediliyordu.
  //
  // 🔴 YÖNLENDİRME YOK — ve ASLA EKLENMEMELİ. Bu kural her host'ta geçerli
  // olduğu için bir 301, süper admin adresini `kurmayteknoloji.com/super-admin`
  // gibi HER MÜŞTERİ DOMAİNİNDEN yayınlardı. Host joker DNS (`A *`) ve joker
  // sertifika altında olduğu için ne DNS'ten ne Certificate Transparency
  // loglarından sayılabiliyor; 404 bu obsküriteyi koruyor.
  //
  // ⚠️ Bu kural YALNIZ SAYFALARI kapatır — `/api` matcher'ın dışında.
  // API tarafının karşılığı: lib/super-admin/api-host-guard.
  if (!superAdminHost && pathname.startsWith("/super-admin")) {
    return notFound();
  }

  // apex / custom_domain başlangıçta "default"; subdomain doğrudan slug.
  // custom_domain için final slug aşağıda DB sorgusuyla belirlenir.
  // NOT: let — closure (cookies.setAll) güncel değeri görsün diye.
  let tenantSlug = "default";
  if (match.type === "subdomain") {
    tenantSlug = match.slug;
  }

  // x-tenant-slug request header'ına HENÜZ yazılmıyor: custom_domain DB
  // sorgusu slug'i değiştirebilir. Forward edilen request header'i NextResponse.next()
  // çağrısı anında yakalandığı için, header'i final slug belli olduktan
  // SONRA set edip response'u yeniden kuruyoruz (aşağıda).
  const requestHeaders = new Headers(request.headers);

  // Nonce HER ISTEKTE yeniden uretilir. Modul seviyesinde sabitlenirse
  // CSP'nin XSS korumasi tamamen degersizlesir (saldirgan nonce'u kopyalar).
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);

  // KRITIK: Next nonce'u REQUEST'in CSP header'indan okur
  // (app-render.js -> getScriptNonceFromHeader). Sadece response'a yazmak
  // YETMEZ — o zaman Next'in kendi inline bootstrap script'leri nonce'suz
  // kalir, tarayici hepsini bloklar ve site tamamen olur.
  // x-nonce yalnizca kolaylik: uygulama kodu headers().get("x-nonce") ile
  // kendi inline script'ine nonce koymak isterse diye. Su an kullanan yok.
  requestHeaders.set(CSP_HEADER_NAME, csp);
  requestHeaders.set("x-nonce", nonce);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          // tenantSlug closure'dan okunur. setAll, auth.getUser() sırasında
          // (custom_domain DB sorgusundan SONRA) tetiklendiği için güncel
          // slug görünür.
          supabaseResponse.headers.set("x-tenant-slug", tenantSlug);
          // setAll supabaseResponse'u YENIDEN KURUYOR — daha once yazilmis
          // CSP header'i bu satir olmadan token yenilenen isteklerde duserdi.
          // x-tenant-slug ile birebir ayni gerekce.
          supabaseResponse.headers.set(CSP_HEADER_NAME, csp);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // KRİTİK: custom_domain DB sorgusu auth.getUser() ÖNCESİNDE yapılmalı.
  // Böylece hem setAll closure'i hem de forward edilen request header'i
  // güncel slug'i taşır. Sorgu yalnızca custom_domain case'inde çalışır;
  // subdomain/apex DB'ye hiç gitmez. Anon key + tenants_public_select
  // (USING true) yeterli — service role gerekmez.
  let tenantResolveFailed = false;

  if (match.type === "custom_domain") {
    const { data, error } = await supabase
      .from("tenants")
      .select("slug")
      .eq("custom_domain", match.host)
      .maybeSingle();

    if (error) {
      console.error("[Middleware] custom_domain lookup hatasi:", error);
      tenantResolveFailed = true;
    } else if (data?.slug) {
      tenantSlug = data.slug;
    } else {
      // Bulunamadi (data null)
      tenantResolveFailed = true;
    }
  }

  // ==========================================================================
  // FAIL-CLOSED — yalnizca /admin ve /super-admin
  // ==========================================================================
  // Public tarafta mevcut davranis KORUNUR: tenantSlug "default" kalir, ziyaretci
  // default siteyi gorur (salt okuma, zarar yok, site tamamen kapanmaz).
  //
  // Admin tarafinda AYNI davranis TEHLIKELI: yonetici, yanlis tenant'in
  // panelinde islem yapar. 8 Eylul 2026 bug'inin zarar mekanizmasi tam olarak
  // "sessizce default'a dusme" idi. Burada yanlis panel acmaktansa hicbir
  // panel acmamak dogru: hata sayfasina yonlendirilir.
  //
  // /admin/giris DAHIL: cozulemeyen bir host'ta giris yapmak da yanlis
  // tenant'a girmek demektir. TENANT_ERROR_PATH'in kendisi haric tutulur
  // (yoksa sonsuz yonlendirme).
  //
  // `/super-admin` BU KOSULDAN CIKARILDI (Deploy 2): kural (b) artik bu
  // noktadan ONCE 404 veriyor. `tenantResolveFailed` yalniz custom_domain
  // dalinda true olabiliyor, custom_domain host'u da super admin host'u
  // olamaz — yani sart ULASILAMAZ hale gelmisti.
  if (
    tenantResolveFailed &&
    pathname.startsWith("/admin") &&
    pathname !== TENANT_ERROR_PATH
  ) {
    const url = request.nextUrl.clone();
    url.pathname = TENANT_ERROR_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Final slug belli. Forward edilen request header'ına yaz ve response'u
  // güncel header'larla YENİDEN kur (setAll henüz tetiklenmemiş olabilir —
  // bu rebuild olmadan no-cookie-refresh durumunda slug forward edilmezdi).
  requestHeaders.set("x-tenant-slug", tenantSlug);
  supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  supabaseResponse.headers.set("x-tenant-slug", tenantSlug);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // setAll hic tetiklenmediyse (cerez yenilenmedi) response'a CSP'yi yazan
  // tek yer burasi. getUser'dan SONRA olmali: setAll auth.getUser() sirasinda
  // tetiklenip supabaseResponse'u yeniden kurabiliyor.
  supabaseResponse.headers.set(CSP_HEADER_NAME, csp);

  // Admin giris ve davet-kabul/yetkisiz sayfalari haric tum admin rotalarini koru
  // (davet-kabul login OLMAYAN kullanici icin token ile session olusturur)
  const ADMIN_PUBLIC_PATHS = [
    "/admin/giris",
    "/admin/davet-kabul",
    "/admin/sifremi-unuttum",
    "/admin/yetkisiz",
    TENANT_ERROR_PATH,
  ];
  if (pathname.startsWith("/admin") && !ADMIN_PUBLIC_PATHS.includes(pathname)) {
    if (!user) {
      const loginUrl = new URL("/admin/giris", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Süper admin rotalarını da auth ile koru.
  // Süper admin yetkisi kontrolü (is_super_admin) middleware'de YAPILMAZ
  // (her request'te RPC çağırmak pahalı). Bu kontrol layout'ta yapılır.
  //
  // Giriş artık /admin/giris DEĞİL — o sayfa tenant'a bağlı
  // (`admin/giris/page.tsx` getCurrentTenantOrNull kullanıyor) ve süper
  // admin host'unda kurum olmadığı için "Kurum bulunamadı" ekranına
  // düşerdi. /super-admin/giris tenant'a hiç dokunmuyor, dolayısıyla HER
  // host'ta çalışır — host'a göre dallanmaya gerek yok.
  if (
    pathname.startsWith("/super-admin") &&
    !SUPER_ADMIN_PUBLIC_PATHS.includes(pathname)
  ) {
    if (!user) {
      const loginUrl = new URL(SUPER_ADMIN_LOGIN_PATH, request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Giriş yapmış kullanıcı süper admin giriş sayfasına giderse panele al.
  // Süper admin DEĞİLSE de /super-admin'e gider ve orada "yetkiniz yok"
  // ekranını görür — is_super_admin RPC'si burada ÇAĞRILMAZ (karar tek
  // yerde, (authenticated)/layout.tsx'te).
  if (pathname === SUPER_ADMIN_LOGIN_PATH && user) {
    const rawNext = request.nextUrl.searchParams.get("next");
    // next YALNIZ /super-admin altına gidebilir: bu sayfa süper admin
    // yüzeyinin kapısı, başka bir yere sıçrama tahtası değil.
    const safeNext =
      !!rawNext && rawNext.startsWith("/super-admin") && !rawNext.startsWith("//");

    const url = request.nextUrl.clone();
    url.search = "";
    url.pathname = safeNext ? rawNext! : "/super-admin";
    return NextResponse.redirect(url);
  }

  // Giris yapmis kullanici giris sayfasina giderse rolune gore yonlendir
  if (pathname === "/admin/giris" && user) {
    // YÖNLENDİRME 7 (Deploy 2) — hedef ARTIK HER ZAMAN kurum paneli.
    //
    // `/admin/giris` yalnız kurum host'larında var (süper admin host'unda
    // `/admin` kural (a) ile 404). O host'larda `/super-admin` de kural (b)
    // ile 404 — yani buradan oraya yollamak kullanıcıyı 404'e atmak olurdu.
    // Süper admin panele kendi host'undan, kendi oturumuyla girer.
    //
    // `is_super_admin` RPC'si BU YÜZDEN KALDIRILDI: tek işi hedefi seçmekti,
    // seçim kalmadı. Her girişten bir RPC eksildi.
    //
    // Süper admin panelinin adresi burada ANILMAZ: bu sayfa her müşteri
    // domaininde açık, oradan panel adresini duyurmak kural (b)'nin
    // 404 kararını boşa çıkarırdı.
    const rawNext = request.nextUrl.searchParams.get("next");
    const safeNext =
      !!rawNext &&
      rawNext.startsWith("/") &&
      !rawNext.startsWith("//") &&
      !rawNext.startsWith("/super-admin");

    const url = request.nextUrl.clone();
    url.search = ""; // next param redirect URL'inden temizle
    url.pathname = safeNext ? rawNext! : "/admin";

    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Statik dosyalar ve API hariç tüm rotalar (public + admin)
    "/((?!_next/static|_next/image|favicon.ico|api).*)",
  ],
};
