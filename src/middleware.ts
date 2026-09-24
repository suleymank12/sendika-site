import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient as createOturumsuzClient, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { parseHostname } from "@/lib/tenant-hostname";
import { imzala } from "@/lib/tenant-proof";
import {
  BILINMEYEN_ALAN_SLUG,
  KURUM_DURUMU_BASLIGI,
  KURUM_DURUMU_GECICI_HATA,
  SUPER_ADMIN_HOME_PATH,
  SUPER_ADMIN_LOGIN_PATH,
} from "@/lib/constants";
import { AUTH_RETURN_PATH, parseAuthLink } from "@/lib/super-admin/admin-invite";
import {
  isAuthCookieName,
  isTransportAuthError,
  sanitizeAuthCookies,
} from "@/lib/supabase/cookie-sanitize";
import { kisaHata, SUPABASE_BUTCE_MS, zamanAsimliFetch } from "@/lib/supabase/zaman-asimli-fetch";

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

/**
 * AUTH YALNIZ PANEL YOLLARINDA (C6, 25 Eylül 2026). Public sayfalar
 * kullanıcıya göre değişmez (C5: oturumsuz anon istemci); orada `getUser`
 * yalnız maliyet ve risk üretiyordu: süresi geçmiş admin çereziyle public
 * anasayfa kesintide jeton yenileme penceresinde 171 sn bekliyordu (teşhis).
 * Public yolda çerez OKUNMAZ, yenilenmez, SİLİNMEZ.
 */
const PANEL_ONEKLERI = ["/admin", "/super-admin"] as const;

/**
 * Panel yollarında `getUser`'ın TOPLAM bütçesi (C6): çağrı başına 4 sn
 * (zaman-asimli-fetch "middleware") jeton yenilemesinde yetmiyor — auth-js
 * yenilemeyi 30 sn'lik pencerede geri çekilmeyle yeniden dener. Süre dolunca
 * TAŞIMA dalı: user = null, çerez KORUNUR, girişe. Asla "girişli say" değil.
 */
const AUTH_TOPLAM_BUTCE_MS = SUPABASE_BUTCE_MS.middleware;

/** Host kurallarının cevabı — gövdesiz, markasız, sessiz. */
function notFound(): NextResponse {
  return new NextResponse("Not Found", {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * VERİTABANI GEÇİCİ HATASI (B2, 23 Eylül 2026) — özel alan adı sorgusu HATA
 * verdiğinde (satır yok DEĞİL). Eskiden "bulunamadı" ile aynı yola girip
 * public tarafta default kurumun sitesini gösteriyordu; "bulunamadı" artık
 * nötr 404 olduğu için aynı yola girse MÜŞTERİNİN sitesi geçici bir Supabase
 * kesintisinde 404 verirdi ve arama motoru sayfaları düşürürdü.
 *
 * 503 + Retry-After: "geçici, sonra gel". Gövde nötr (hiçbir kurumun adı
 * yok), script yok, noindex. Public ve /admin İÇİN AYNI: admin'de "alan adı
 * tanımlı değil" demek yanlış olurdu — alan adı tanımlı olabilir, yalnız şu
 * an okunamadı. `x-kurum-durumu`: kurulum yoklaması Nginx'in kendi 503'ünü
 * bundan ayırt etsin (setup-checklist evaluateAppResponse).
 */
const GECICI_HATA_HTML =
  '<!doctype html><html lang="tr"><head><meta charset="utf-8">' +
  '<meta name="robots" content="noindex"><title>Geçici sorun</title></head>' +
  "<body><h1>Geçici bir sorun oluştu</h1>" +
  "<p>Site şu anda yanıt veremiyor. Lütfen birkaç dakika sonra yeniden deneyin.</p>" +
  "</body></html>";

function geciciHataYaniti(): NextResponse {
  return new NextResponse(GECICI_HATA_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "retry-after": "30",
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'",
      [KURUM_DURUMU_BASLIGI]: KURUM_DURUMU_GECICI_HATA,
    },
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
  // bedavaya korunuyor. (TEK İSTİSNA kök yol — hemen aşağıda, gerekçesiyle.)
  //
  // Neden BURADA, auth/CSP kurulumundan ÖNCE: reddedilen istek için
  // Supabase istemcisi kurmak, nonce üretmek ve `auth.getUser()` çağırmak
  // tamamen boşa iş. Statik varlıklar (`/_next/static`, `/_next/image`)
  // ve `/api` zaten matcher'ın dışında — panel çalışmaya devam eder.
  //
  const superAdminHost = match.type === "super_admin";

  // KÖK YOL TEK İSTİSNA (20 Eylül 2026): panel host'unun kökü (`/`) 404
  // yerine panele yönlendirilir — adresi elle yazan süper admin boş bir
  // 404 görmesin.
  //
  // Obskürite neden bozulmuyor: bu satır YALNIZ panel host'unda çalışır,
  // yani adresi ZATEN bilen birine cevap verir. Kural (b) (aşağıda) hiç
  // değişmedi: başka hiçbir host'ta `/super-admin` açılmaz, hiçbir host
  // panelin adresini yayınlamaz. Tek kabul edilen bedel, host'u bulmuş
  // bir tarayıcının `/` yoklamasında panelin varlığını öğrenmesi —
  // `/super-admin`'i denese zaten öğrenecekti.
  //
  // 307 (geçici) bilerek: kalıcı yönlendirme tarayıcıda önbelleğe alınır,
  // karardan dönmek istersek elimizi bağlar.
  if (superAdminHost && pathname === "/") {
    return NextResponse.redirect(new URL(SUPER_ADMIN_HOME_PATH, request.url));
  }

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

  // ==========================================================================
  // KURAL (c) — APEX YAKALAYICI: kökteki mail jetonu kabul sayfasına
  // ==========================================================================
  // (20 Eylül 2026, P3) Mail şablonları jetonu `{{ .RedirectTo }}` adresine
  // ekliyor. `.RedirectTo` GoTrue'nun DOĞRULADIĞI adrestir: müşterinin
  // domaini Redirect URLs listesinde yoksa GoTrue onu sessizce **Site URL'e**
  // (apex kökü) çevirir. Ölçüldü (20 Eylül, service_role, mail gitmeden):
  //
  //   generate_link recovery + izin listesinde OLMAYAN dönüş adresi
  //     → RedirectTo = "https://<apex>"      (kök, yolsuz)
  //     → şablon linki  "https://<apex>?token_hash=…&type=recovery"
  //
  // Yani kurulum adımı (KURULUM 6.1) unutulduğunda kişi şifre formu yerine
  // platformun ANA SAYFASINA düşüyor. Bu satırlar arızayı "hiç çalışmıyor"dan
  // "çalışıyor ama önce apex'e uğruyor" seviyesine indiriyor: jeton tek
  // kullanımlık ve sorgu korunarak taşındığı için yeni bir risk açılmıyor.
  //
  // ⚠️ DAVET bu ağa TAKILMAZ ve takılamaz: davetin dönüş adresi `?tenant=`
  // taşıdığı için şablon birleştiricisi `&` (AUTH_LINK_JOINER) — geri düşüşte
  // link "https://<apex>&token_hash=…" olur, bu da geçerli bir adres değil,
  // tarayıcı `<apex>&token_hash=…` diye bir HOST arar ve DNS'te bulamaz;
  // istek sunucuya hiç gelmez (ölçüldü). Davetin tek güvencesi
  // `NEXT_PUBLIC_SITE_URL`'in Site URL ile aynı host olması (KURULUM Adım 8).
  //
  // 🔴 KURAL (a)/(b)'DEN SONRA, o bloğun DIŞINDA duruyor: host kuralları
  // bloğu `test-super-admin-host.mjs` tarafından "tek redirect" diye mühürlü
  // (panel adresi hiçbir host'tan yayılmasın). Bu yönlendirmenin panelle
  // ilgisi yok; süper admin host'u ise bu satıra hiç ulaşmaz (kökü zaten
  // yukarıda panele gidiyor, gerisi 404).
  //
  // Fail-closed BOZULMAZ: yönlendirme yalnız yolu değiştirir. Çözülemeyen bir
  // custom domain'de yeni istek `/admin/…` olarak gelir ve aşağıdaki
  // fail-closed kuralı onu `tenant-bulunamadi`ya alır.
  if (pathname === "/" && parseAuthLink(request.nextUrl.search, "").route === "token_hash") {
    const url = request.nextUrl.clone();
    url.pathname = AUTH_RETURN_PATH;
    return NextResponse.redirect(url);
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

  // Çözümlenemediği için elenen auth çerezlerinin adları — `getAll()`
  // doldurur, `yanit()` bunları tarayıcıdan düşürür.
  const bozukCerezAdlari: string[] = [];

  // KÜTÜPHANENİN YAZDIĞI ÇEREZLER (C6a, 25 Eylül 2026) — `setAll` doldurur
  // (yenilenen jetonlar, 4xx'te oturum silmesi), `yanit()` bunları
  // middleware'in döndürdüğü HER yanıta yazar. Eskiden yalnız
  // `supabaseResponse`'a yazılıyordu; yönlendirme (`NextResponse.redirect`)
  // ve 503 ayrı nesne olduğu için tarayıcıya ULAŞMIYORDU (ölçüldü: yenilenen
  // jeton kayboluyor, tarayıcı kullanılmış yenileme jetonuyla kalıyordu).
  const kutuphaneCerezleri = new Map<string, { value: string; options: CookieOptions }>();

  /**
   * Middleware'in DÖNDÜĞÜ HER yanıt buradan geçer (bu noktadan sonraki tüm
   * `return`'ler). İki işi var:
   *   1. kütüphanenin yazdığı çerezleri (C6a) her yanıta taşımak;
   *   2. kullanılamaz bulunan auth çerezlerini tarayıcıdan düşürmek — sistem
   *      kendini onarsın, kullanıcı "çerezleri temizle"yi bilmek zorunda
   *      kalmasın.
   *
   * `Max-Age=0` + aynı `path`: çerez host-only ve `path=/` yazıldığı için
   * (bkz. @supabase/ssr DEFAULT_COOKIE_OPTIONS) bu silme eşleşir.
   */
  const yanit = (res: NextResponse): NextResponse => {
    kutuphaneCerezleri.forEach(({ value, options }, name) => {
      res.cookies.set(name, value, options);
    });
    // Bozuk çerez silmesi SONRA: aynı ad iki listede de varsa silme kazanır.
    for (const name of bozukCerezAdlari) {
      res.cookies.set(name, "", { path: "/", maxAge: 0 });
    }
    return res;
  };

  // Oturumlu istemci YALNIZ panel yolunda kurulur (C6): kurucusu bile çerezi
  // okur (auth-js _initialize → _recoverAndRefresh → getAll) ve geçersiz
  // oturumu silebilir.
  const oturumluIstemci = () => createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // C3: middleware butcesi cagri basina 4 sn (ozel alan adi sorgusu, getUser).
      global: { fetch: zamanAsimliFetch("middleware") },
      cookies: {
        getAll() {
          // 🔴 BOZUK ÇEREZ SAVUNMASI — ilk katman (20 Eylül 2026).
          // Çözümlenemeyen auth çerezi Supabase istemcisine HİÇ verilmez;
          // verilirse `Invalid UTF-8 sequence` fırlatır ve middleware her
          // rotada çalıştığı için PUBLIC SİTE DAHİL her şey 500 olur.
          // Elenen adlar aşağıda yanıtta süresi doldurularak silinir.
          const { kept, droppedNames } = sanitizeAuthCookies(request.cookies.getAll());
          for (const name of droppedNames) {
            if (!bozukCerezAdlari.includes(name)) bozukCerezAdlari.push(name);
          }
          return kept;
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
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
            kutuphaneCerezleri.set(name, { value, options });
          });
        },
      },
    }
  );

  // KRİTİK: custom_domain DB sorgusu auth.getUser() ÖNCESİNDE yapılmalı.
  // Böylece hem setAll closure'i hem de forward edilen request header'i
  // güncel slug'i taşır. Sorgu yalnızca custom_domain case'inde çalışır;
  // subdomain/apex DB'ye hiç gitmez. Anon key + tenants_public_select
  // (USING true) yeterli — service role gerekmez.
  //
  // ÇEREZSİZ istemci (C6): sorgu kullanıcıya göre değişmez. Oturumlu istemci
  // her sorguda oturumu çerezden okur (supabase-js _getAccessToken →
  // getSession) ve süresi geçmişse YENİLER — public özel alan adında bile.
  let tenantResolveFailed = false;

  if (match.type === "custom_domain") {
    const { data, error } = await createOturumsuzClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        // C3: middleware butcesi 4 sn.
        global: { fetch: zamanAsimliFetch("middleware") },
      }
    )
      .from("tenants")
      .select("slug")
      .eq("custom_domain", match.host)
      .maybeSingle();

    if (error) {
      // VERİTABANI HATASI ≠ BULUNAMADI (B2) — gerekçe: geciciHataYaniti.
      console.error("[Middleware] custom_domain lookup hatasi:", kisaHata(error));
      return yanit(geciciHataYaniti());
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
  // Public taraf (B2, 23 Eylul 2026'dan beri): default'a DUSULMEZ — asagida
  // isaret slug'i yazilir, notr 404. Eskiden "default" kaliyordu: kayitli
  // olmayan / musterisi ayrilmis alan adi default kurumun sitesini
  // indekslenebilir hâlde yayinliyordu (raporlar/2026-09-23-0159-…).
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
    return yanit(NextResponse.redirect(url));
  }

  // BİLİNMEYEN ÖZEL ALAN ADI (B2, 23 Eylül 2026): public tarafta artık
  // default'a DÜŞÜLMEZ — işaret slug'ı (lib/constants BILINMEYEN_ALAN_SLUG)
  // yazılır, render K8'in nötr 404'üne iner (resolveCurrentTenant DB'ye
  // gitmeden `unknown-slug`). /admin yukarıdaki fail-closed ile zaten
  // tenant-bulunamadi'ya gitti; o sayfanın KENDİ isteği de buradan işaretle
  // geçer ve admin layout nötr ekranı render eder (kurum kimliği YOK).
  if (tenantResolveFailed) tenantSlug = BILINMEYEN_ALAN_SLUG;

  // Final slug belli. Forward edilen request header'ına yaz ve response'u
  // güncel header'larla YENİDEN kur (setAll henüz tetiklenmemiş olabilir —
  // bu rebuild olmadan no-cookie-refresh durumunda slug forward edilmezdi).
  requestHeaders.set("x-tenant-slug", tenantSlug);
  // 🔴 KURUM KANITI (K7-B, 21 Eylül 2026) — slug'la AYNI noktada, AYNI
  // `requestHeaders` nesnesine. setAll (çerez yenilenince) response'u bu
  // nesneyle yeniden kurduğu için kanıt o yolda da taşınır.
  //
  // Host = slug'ın çözüldüğü `hostname` (satır ~104, ham Host başlığı);
  // render `headers().get("host")` ile doğruluyor — ikisinin birebir aynı
  // olduğu ölçüldü (raporlar/2026-09-21-2250-k7-b-uygulama.md).
  //
  // YALNIZ İSTEK başlığı: `supabaseResponse.headers.set("x-tenant-proof", …)`
  // ASLA — Next 14 yanıt başlıklarını istemciye de gönderiyor (ölçüldü).
  // Sır yoksa imzala reddeder: istemciden gelmiş olabilecek kanıt SİLİNİR,
  // render nötre düşer (fail-closed; log satırı lib/tenant-proof.ts'te).
  try {
    requestHeaders.set("x-tenant-proof", await imzala(hostname, tenantSlug));
  } catch {
    requestHeaders.delete("x-tenant-proof");
  }
  supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  supabaseResponse.headers.set("x-tenant-slug", tenantSlug);

  // ==========================================================================
  // 🔴 BOZUK ÇEREZ SAVUNMASI — ikinci katman (20 Eylül 2026)
  // ==========================================================================
  // `getAll()` süzgeci çözümlenemeyen çerezleri zaten ayıklıyor; buraya
  // ondan KAÇAN bir şey düşerse (parça birleştirme, kütüphane sürüm
  // değişikliği, hiç beklemediğimiz bir biçim) istek yine de 500 olmamalı.
  //
  // İKİ HATA SINIFI AYRI (gerekçe + ölçüm: lib/supabase/cookie-sanitize):
  //   - ÇÖZÜMLEME  → çerez kullanılamaz durumda, SİLİNİR (kendini onarma)
  //   - TAŞIMA     → Supabase erişilemiyor, çerez KORUNUR (kesinti geçince
  //                  kimse yeniden giriş yapmak zorunda kalmasın)
  //
  // Her iki durumda da istek OTURUMSUZ sürer: `user` null olur, /admin
  // rotaları girişe yönlenir, public site açık kalır.
  //
  // C6 (25 Eylül 2026): YALNIZ panel yollarında, TOPLAM bütçeyle
  // (PANEL_ONEKLERI, AUTH_TOPLAM_BUTCE_MS).
  let user: User | null = null;
  const panelYolu = PANEL_ONEKLERI.some((onek) => pathname.startsWith(onek));
  if (panelYolu) {
    const supabase = oturumluIstemci();
    try {
      const getUserIstegi = supabase.auth.getUser();
      // Yarışı kaybeden istek sonradan reddedilirse sahipsiz ret olmasın.
      getUserIstegi.catch(() => {});
      let zamanlayici: ReturnType<typeof setTimeout> | undefined;
      const sonuc = await Promise.race([
        getUserIstegi,
        new Promise<"sure-doldu">((coz) => {
          zamanlayici = setTimeout(() => coz("sure-doldu"), AUTH_TOPLAM_BUTCE_MS);
        }),
      ]);
      clearTimeout(zamanlayici);
      if (sonuc === "sure-doldu") {
        // TAŞIMA dalıyla aynı: çerez korunur, istek oturumsuz sürer.
        console.error(
          `[Middleware] Supabase auth erisilemedi (cerez KORUNDU): toplam butce ${AUTH_TOPLAM_BUTCE_MS} ms doldu`
        );
      } else {
        const { data, error } = sonuc;
        user = data.user;

        if (error && !isTransportAuthError(error)) {
          // 4xx: saklanan oturum kullanılamıyor (bozuk/geçersiz). Sessizce
          // geçilmez — çerez düşürülür ki kullanıcı bir daha aynı duvara
          // toslamasın. "Oturum yok" (çerezsiz istek) bu dala HİÇ girmez:
          // orada silinecek bir ad da yoktur.
          for (const cookie of request.cookies.getAll()) {
            if (isAuthCookieName(cookie.name) && !bozukCerezAdlari.includes(cookie.name)) {
              bozukCerezAdlari.push(cookie.name);
            }
          }
          if (bozukCerezAdlari.length > 0) {
            console.warn(
              "[Middleware] Oturum cerezi kullanilamaz, dusuruluyor:",
              error.name,
              error.status,
              bozukCerezAdlari.join(", ")
            );
          }
        } else if (error) {
          // TAŞIMA: çerez korunur. Log şart — sessiz kalırsa Supabase kesintisi
          // "kullanıcılar giriş yapamıyor" diye gelir ve saatler kaybedilir.
          console.error("[Middleware] Supabase auth erisilemedi (cerez KORUNDU):", kisaHata(error));
        }
      }
    } catch (err) {
      // Beklenmeyen fırlatma — YUTULMUYOR, tam hâliyle loglanıyor.
      // Çözümleme sınıfı sayılır (taşıma hataları fırlatmıyor, ölçüldü):
      // çerez düşürülür, istek oturumsuz sürer.
      console.error("[Middleware] auth.getUser() beklenmeyen hata:", err);
      for (const cookie of request.cookies.getAll()) {
        if (isAuthCookieName(cookie.name) && !bozukCerezAdlari.includes(cookie.name)) {
          bozukCerezAdlari.push(cookie.name);
        }
      }
    }
  }

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
      return yanit(NextResponse.redirect(loginUrl));
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
      return yanit(NextResponse.redirect(loginUrl));
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
    return yanit(NextResponse.redirect(url));
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

    return yanit(NextResponse.redirect(url));
  }

  return yanit(supabaseResponse);
}

export const config = {
  matcher: [
    // Middleware'in DIŞINDA kalanlar — yalnız TAM YOLLAR (21 Eylül 2026):
    //   /api/…            route handler'lar; kurumu host'tan KENDİLERİ çözer
    //                     (ör. api/contact), host kuralları api-host-guard'da
    //   /_next/static/…   derlenmiş varlıklar (performans)
    //   /_next/image      görsel ucu — TAM eşleşme (performans)
    //   /favicon.ico      TAM eşleşme
    //
    // 🔴 ESKİ HÂLİ `(?!_next/static|_next/image|favicon.ico|api)` ÖNEK
    // eşleşmesiydi: `api` ile BAŞLAYAN her yol (/apix, /apiler, /api-…)
    // middleware'siz render ediliyordu → slug yok → default kurum (K4:
    // kurmayteknoloji.com/apix Büyük Diriliş'in kimliğini gösteriyordu),
    // gelen x-tenant-slug'a güveniliyordu (K1), CSP yoktu (K2), gelen CSP
    // nonce'u HTML'e yansıyordu (K3). Ölçüm + mühür: test:izolasyon.
    //
    // Kaçış: `\\.` string içinde → regex'te `\.` (nokta harfiyen);
    // `$` lookahead içinde yolun SONU (Next matcher'ı yol üzerinde test eder).
    "/((?!api/|_next/static/|_next/image$|favicon\\.ico$).*)",
  ],
};
