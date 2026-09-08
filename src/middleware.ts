import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { parseHostname } from "@/lib/tenant-hostname";

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

export async function middleware(request: NextRequest) {
  // Hostname'i parse et (DB'siz, senkron). Server Component'ler tenant'i
  // x-tenant-slug header'i üzerinden okuyacak.
  const hostname = request.headers.get("host") || "localhost:3000";
  const match = parseHostname(hostname);

  // pathname BURADA okunuyor (eskiden auth blogundan hemen once okunuyordu):
  // custom_domain cozulemedigi durumda admin yollarini auth islemlerinden
  // ONCE kesmek icin gerekli.
  const { pathname } = request.nextUrl;

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
  if (
    tenantResolveFailed &&
    (pathname.startsWith("/admin") || pathname.startsWith("/super-admin")) &&
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
  if (pathname.startsWith("/super-admin")) {
    if (!user) {
      const loginUrl = new URL("/admin/giris", request.url);
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Giris yapmis kullanici giris sayfasina giderse rolune gore yonlendir
  if (pathname === "/admin/giris" && user) {
    // Super admin kontrolu icin RPC (nadir cagri, performans tolere edilir)
    const { data: isSuperAdmin, error: rpcError } = await supabase.rpc(
      "is_super_admin",
      { user_id: user.id }
    );

    if (rpcError) {
      console.error("[Middleware] is_super_admin RPC hatasi:", rpcError);
      // Hata durumunda guvenli taraf: normal admin'e at
    }

    const rawNext = request.nextUrl.searchParams.get("next");
    const safeNext =
      !!rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//");

    const url = request.nextUrl.clone();
    url.search = ""; // next param redirect URL'inden temizle

    if (safeNext && rawNext!.startsWith("/super-admin")) {
      // next /super-admin/* ise: super admin ise oraya, degilse /admin'e
      url.pathname = isSuperAdmin ? rawNext! : "/admin";
    } else if (safeNext) {
      // next normal yolsa: oldugu gibi git (super admin de tenant sayfasina donebilir)
      url.pathname = rawNext!;
    } else {
      // next yoksa: super admin -> /super-admin, normal -> /admin
      url.pathname = isSuperAdmin ? "/super-admin" : "/admin";
    }

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
