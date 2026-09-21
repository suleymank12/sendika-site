/**
 * Super admin ayri host testi — Deploy 1 + Deploy 2 (19 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:super-admin-host
 *   (= node scripts/test-super-admin-host.mjs)
 *
 * BAGLAM:
 *   Super admin paneli tum musterilerin verisine erisiyor ve Supabase
 *   oturum cerezi `httpOnly: false` — yani AYNI ORIGIN'deki bir XSS
 *   token'i dogrudan okuyabiliyor. Panel eskiden
 *   `buyukdirilis.org.tr/super-admin` idi (default kurumun public
 *   sitesiyle ayni origin) ve host kontrolu olmadigi icin HER musteri
 *   domaininden de aciliyordu. Panel kendi host'una tasiniyor:
 *   `superadminpanel.{kok}`.
 *
 * BU TEST NEYI DOGRULAR:
 *   DEPLOY 1
 *   (a) parseHostname — super_admin tipi, tenant'tan AYRI
 *   (b) fail-closed — supheli her host super admin DEGIL
 *   (c) slug rezervasyonu — o alt alanla kurum olusturulamaz
 *   (d) planTenantQuery null — o host'ta kurum SORULMAZ
 *   (e) kural (a) — middleware'de, auth/CSP kurulumundan ONCE, 404
 *   (f) giris akisi — yeni sayfa tenant'a dokunmuyor, yonlendirmeler 1-6
 *   (g) notr marka — root layout o host'ta kurum cozmuyor
 *   DEPLOY 2
 *   (h) kural (b) — diger host'larda /super-admin 404, yonlendirme YOK
 *   (i) API host guard — 8 route / 10 handler, DOSYADAN SAYILIR
 *   (j) Origin kontrolu — ayni-site CSRF kapisi (saf fonksiyon birimi)
 *   (k) yonlendirme 7-8 — giris sonrasi hedef daima /admin
 *   (l) /api/contact — super admin host'unda kapali
 *
 * ⚠️ KAPSAM SINIRI: gercek HTTP istegi ATILMAZ (repoda kosucu yok).
 *   Kural (a)/(b)'nin calisan davranisi yerelde `npm run dev` ile
 *   olculdu; canli davranis NOTE.md manuel test tablosunda.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir.
 */

import { readFileSync, readdirSync } from "node:fs";
import {
  getSuperAdminHost,
  isSameHostOrigin,
  isSuperAdminHost,
  parseHostname,
  planTenantQuery,
} from "../src/lib/tenant-hostname.ts";
import {
  RESERVED_TENANT_SLUGS,
  SUPER_ADMIN_LOGIN_PATH,
  SUPER_ADMIN_SUBDOMAIN,
} from "../src/lib/constants.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (diger test script'leriyle ayni desen)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}

function header(title) {
  console.log("");
  console.log(title);
  console.log("");
}

const read = (p) => readFileSync(p, "utf8");

/**
 * "Bu dosyada su gecmesin" kontrolleri icin yorumlari atar.
 * Gerekce ve sinirlar: scripts/test-setup-guide.mjs (ayni yardimci).
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/** Kaynakta A, B'den ONCE mi geciyor? (ikisi de bulunmali) */
function comesBefore(src, a, b) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
}

// Testler NEXT_PUBLIC_ROOT_DOMAIN'siz kosar -> lvh.me fallback'i gecerli.
const ROOT = "lvh.me";
const SUPER = `${SUPER_ADMIN_SUBDOMAIN}.${ROOT}`;

// ---------------------------------------------------------------------------
header("(a) parseHostname — super_admin tipi");
// ---------------------------------------------------------------------------
{
  ok("parse", "super admin host'u ayri tip", parseHostname(SUPER), { type: "super_admin", host: SUPER }, SUPER);
  ok("parse", "port temizleniyor", parseHostname(`${SUPER}:3000`), { type: "super_admin", host: SUPER }, `${SUPER}:3000`);
  ok("parse", "buyuk harf normalize", parseHostname(SUPER.toUpperCase()), { type: "super_admin", host: SUPER }, "BUYUK HARF");
  ok("parse", "bosluk kirpiliyor", parseHostname(`  ${SUPER}  `), { type: "super_admin", host: SUPER }, "bosluklu");
  // www. on eki giriste soyuluyor -> yine super admin host'u
  ok("parse", "www. on eki soyulur", parseHostname(`www.${SUPER}`), { type: "super_admin", host: SUPER }, `www.${SUPER}`);

  ok("parse", "yardimci host'u ayni uretiyor", getSuperAdminHost(), SUPER, "getSuperAdminHost");
  ok("parse", "isSuperAdminHost true", isSuperAdminHost(SUPER), true, SUPER);
}

// ---------------------------------------------------------------------------
header("(b) Fail-closed — supheli her host super admin DEGIL");
// ---------------------------------------------------------------------------
{
  // Sadece TAM eslesme super admin'dir. Benzeyen hicbir sey degil.
  const notSuper = [
    ROOT,                                   // apex
    `kurmay.${ROOT}`,                       // normal kurum
    `${SUPER_ADMIN_SUBDOMAIN}x.${ROOT}`,    // ek harf
    `x${SUPER_ADMIN_SUBDOMAIN}.${ROOT}`,    // onek
    `${SUPER_ADMIN_SUBDOMAIN}-2.${ROOT}`,   // tire
    `a.${SUPER_ADMIN_SUBDOMAIN}.${ROOT}`,   // coklu parca
    `${SUPER_ADMIN_SUBDOMAIN}.example.com`, // BASKA kok domain
    `${SUPER_ADMIN_SUBDOMAIN}.com`,         // apex gibi
    "kurmayteknoloji.com",                  // musteri custom domain
    "localhost",
    "127.0.0.1",
    "",
  ];
  for (const host of notSuper) {
    ok("fail-closed", `"${host}" super admin DEGIL`, isSuperAdminHost(host), false, host);
  }

  // Bilinmeyen host custom_domain'e duser (super admin yuzeyi kapali)
  ok("fail-closed", "bilinmeyen host custom_domain", parseHostname("rastgele.example.org").type, "custom_domain", "rastgele");
}

// ---------------------------------------------------------------------------
header("(c) Slug rezervasyonu");
// ---------------------------------------------------------------------------
{
  okTrue("rezerve", "alt alan adi RESERVED_TENANT_SLUGS'ta", RESERVED_TENANT_SLUGS.includes(SUPER_ADMIN_SUBDOMAIN), SUPER_ADMIN_SUBDOMAIN);
  // Liste SABITTEN besleniyor: ad degisirse rezervasyon geride kalmasin
  const constants = read("src/lib/constants.ts");
  okTrue("rezerve", "liste sabitten besleniyor (elle yazilmamis)", stripComments(constants).includes("  SUPER_ADMIN_SUBDOMAIN,\n]"), "constants.ts");

  // Iki route da rezerve listesini uyguluyor mu
  for (const route of ["create-tenant", "update-tenant"]) {
    const src = read(`src/app/api/super-admin/${route}/route.ts`);
    okTrue("rezerve", `${route} rezerve slug'i reddediyor`, src.includes("RESERVED_TENANT_SLUGS"), route);
  }
}

// ---------------------------------------------------------------------------
header("(d) planTenantQuery — o host'ta kurum SORULMAZ");
// ---------------------------------------------------------------------------
{
  // null = sorgu HIC atilmaz. "default"a dusurmek, bu projedeki 8 Eylul
  // cross-tenant bug'inin deseninin ta kendisi olurdu.
  ok("plan", "super admin host -> null", planTenantQuery(SUPER), null, SUPER);
  ok("plan", "apex -> default slug (degismedi)", planTenantQuery(ROOT), { by: "slug", value: "default" }, ROOT);
  ok("plan", "kurum subdomain -> slug (degismedi)", planTenantQuery(`kurmay.${ROOT}`), { by: "slug", value: "kurmay" }, "kurmay");
  ok("plan", "custom domain -> custom_domain (degismedi)", planTenantQuery("kurmayteknoloji.com"), { by: "custom_domain", value: "kurmayteknoloji.com" }, "custom");

  const hook = read("src/hooks/useTenant.tsx");
  okTrue("plan", "useTenant null planda sorgu ATMIYOR", stripComments(hook).includes("if (!plan) {"), "useTenant");
  okTrue("plan", "useTenant null planda tenant'i null birakiyor", stripComments(hook).includes("setTenant(null)"), "useTenant");
}

// ---------------------------------------------------------------------------
header("(e) Kural (a) — middleware");
// ---------------------------------------------------------------------------
{
  const mw = read("src/middleware.ts");
  const code = stripComments(mw);

  okTrue("kural-a", "super admin host'u tespit ediliyor", code.includes('match.type === "super_admin"'), "middleware");
  okTrue("kural-a", "/super-admin disi 404", code.includes('if (superAdminHost && !pathname.startsWith("/super-admin"))'), "middleware");
  okTrue("kural-a", "404 doner (yonlendirme DEGIL)", code.includes("status: 404"), "middleware");

  // 🔴 Yonlendirme OLMAMALI: kural (b) her host'ta gecerli olacagi icin bir
  // 301, super admin adresini HER MUSTERI DOMAININDEN yayinlardi.
  //
  // 20 Eylul 2026 — TEK ISTISNA: panel host'unun KOK adresi (`/`) panele
  // yonlendiriliyor. Bu satir yalniz panel host'unda calisir, yani adresi
  // ZATEN bilen birine cevap verir; kural (b) hic degismedi. Iddia
  // daraltildi ama GEVSEMEDI: blokta tek bir redirect olabilir, o da
  // SADECE kok yol icin (bkz. NOTE.md "TEK ISTISNA").
  const ruleBlock = code.slice(code.indexOf("superAdminHost"), code.indexOf("let tenantSlug"));
  const redirectSatirlari = ruleBlock
    .split("\n")
    .filter((line) => line.includes("redirect"))
    .map((line) => line.trim());
  ok(
    "kural-a",
    "kural blogunda TEK redirect (yalniz kok yol)",
    redirectSatirlari,
    ["return NextResponse.redirect(new URL(SUPER_ADMIN_HOME_PATH, request.url));"],
    "middleware"
  );
  okTrue(
    "kural-a",
    "o redirect yalniz pathname === '/' icin",
    comesBefore(ruleBlock, 'if (superAdminHost && pathname === "/") {', "NextResponse.redirect("),
    "middleware"
  );
  okTrue(
    "kural-a",
    "404 kurali redirect'ten SONRA duruyor",
    comesBefore(ruleBlock, "NextResponse.redirect(", 'if (superAdminHost && !pathname.startsWith("/super-admin"))'),
    "middleware"
  );

  // Kural, auth/CSP kurulumundan ONCE calismali: reddedilen istek icin
  // Supabase istemcisi kurmak ve getUser() cagirmak bosa is.
  okTrue(
    "kural-a",
    "kural createServerClient'tan ONCE",
    code.indexOf("superAdminHost") < code.indexOf("createServerClient("),
    "sira"
  );
  okTrue(
    "kural-a",
    "kural auth.getUser()'dan ONCE",
    code.indexOf("superAdminHost") < code.indexOf("auth.getUser()"),
    "sira"
  );

  // Statik varliklar ve /api/ matcher'in disinda -> panel calisir.
  // 21 Eylul 2026: dislama ONEKTEN TAM YOLA gecti (`api/`, `_next/static/`,
  // `_next/image$`, `favicon\.ico$`) — eski `|api)` onegi /apix'i de
  // disliyordu (K1-K4). Davranisin kendisi (hangi yol iceride/disarida)
  // gercek HTTP ile test:izolasyon bolum (6)'da muhurlu.
  okTrue("kural-a", "matcher statikleri disliyor", code.includes("_next/static/"), "matcher");
  okTrue("kural-a", "matcher /api/'yi (tam yol) disliyor", code.includes("(?!api/|"), "matcher");
  okTrue("kural-a", "matcher'da eski ONEK dislama yok", !code.includes("|api)"), "matcher");
}

// ---------------------------------------------------------------------------
header("(f) Giris akisi — yeni sayfa + yonlendirmeler 1-6");
// ---------------------------------------------------------------------------
{
  ok("giris", "giris yolu sabiti", SUPER_ADMIN_LOGIN_PATH, "/super-admin/giris", "sabit");

  // Sayfa (authenticated) grubunun DISINDA olmali, yoksa auth kapisina takilir
  const loginPage = read("src/app/super-admin/giris/page.tsx");
  const loginForm = read("src/app/super-admin/giris/SuperAdminLoginForm.tsx");

  // 🔴 TENANT'A HIC DOKUNMAMALI: /admin/giris getCurrentTenantOrNull
  // kullaniyor ve super admin host'unda kurum olmadigi icin "Kurum
  // bulunamadi" ekranina duserdi. Ayrica bu host hicbir musteri markasi
  // tasimamali (kimlik avi yuzeyi).
  for (const [name, src] of [["page", loginPage], ["form", loginForm]]) {
    const c = stripComments(src);
    okTrue("giris", `${name}: getCurrentTenant YOK`, !c.includes("getCurrentTenant"), name);
    okTrue("giris", `${name}: useTenant YOK`, !c.includes("useTenant"), name);
    okTrue("giris", `${name}: site_settings sorgusu YOK`, !c.includes("site_settings"), name);
  }
  okTrue("giris", "notr marka", loginForm.includes("Platform Yönetimi"), "form");
  okTrue("giris", "sifremi-unuttum YOK (Supabase Redirect URL gerekmesin)", !loginForm.includes("sifremi-unuttum"), "form");
  okTrue("giris", "next yalniz /super-admin altina gider", stripComments(loginForm).includes('next.startsWith("/super-admin")'), "form");

  // (authenticated) grubu: layout ve sayfalar tasindi, URL'ler ayni
  for (const p of [
    "src/app/super-admin/(authenticated)/layout.tsx",
    "src/app/super-admin/(authenticated)/page.tsx",
    "src/app/super-admin/(authenticated)/tenants/page.tsx",
    "src/app/super-admin/(authenticated)/tenants/yeni/page.tsx",
    "src/app/super-admin/(authenticated)/tenants/[id]/page.tsx",
    "src/app/super-admin/(authenticated)/baglantisiz-hesaplar/page.tsx",
  ]) {
    okTrue("giris", `grup icinde: ${p.split("(authenticated)/")[1]}`, read(p).length > 0, p);
  }

  const mw = read("src/middleware.ts");
  const layout = read("src/app/super-admin/(authenticated)/layout.tsx");
  const sidebar = read("src/components/super-admin/SuperAdminSidebar.tsx");
  const idleLib = read("src/lib/idle-timeout.ts");
  const idleHook = read("src/hooks/useIdleTimeout.tsx");
  const shell = read("src/components/super-admin/SuperAdminShell.tsx");

  // 1) middleware: oturumsuz /super-admin -> yeni giris
  okTrue("yon-1", "middleware yeni giris yoluna yolluyor", stripComments(mw).includes("new URL(SUPER_ADMIN_LOGIN_PATH, request.url)"), "middleware");
  // Giris sayfasinin KENDISI auth kapisinin disinda olmali (dongu)
  okTrue("yon-1", "giris sayfasi public listede", stripComments(mw).includes("SUPER_ADMIN_PUBLIC_PATHS"), "middleware");
  // 2) layout: oturumsuz -> yeni giris
  okTrue("yon-2", "layout yeni giris yoluna yolluyor", stripComments(layout).includes("redirect(SUPER_ADMIN_LOGIN_PATH)"), "layout");
  // 3) layout: yetkisiz -> RENDER (yonlendirme yok)
  okTrue("yon-3", "yetkisizde render", stripComments(layout).includes("<SuperAdminYetkisizView />"), "layout");
  okTrue("yon-3", "yetkisizde /admin/giris'e redirect YOK", !stripComments(layout).includes('redirect("/admin/giris")'), "layout");
  // 4) sidebar cikis
  okTrue("yon-4", "cikis yeni giris yoluna gidiyor", stripComments(sidebar).includes("router.push(SUPER_ADMIN_LOGIN_PATH)"), "sidebar");
  okTrue("yon-4", "sidebar'da /admin/giris KALMADI", !stripComments(sidebar).includes('"/admin/giris"'), "sidebar");
  // 5) idle-timeout: loginPath parametresi
  okTrue("yon-5", "buildIdleLoginUrl loginPath aliyor", stripComments(idleLib).includes("loginPath?: string"), "idle-timeout");
  okTrue("yon-5", "varsayilan kurum paneli girisi", stripComments(idleLib).includes('DEFAULT_IDLE_LOGIN_PATH = "/admin/giris"'), "idle-timeout");
  okTrue("yon-5", "SuperAdminShell kendi yolunu veriyor", stripComments(shell).includes("loginPath={SUPER_ADMIN_LOGIN_PATH}"), "shell");
  // 6) bfcache donusu de ayni yola gitmeli
  okTrue("yon-6", "bfcache sabit /admin/giris KULLANMIYOR", !stripComments(idleHook).includes('window.location.replace("/admin/giris")'), "useIdleTimeout");
  okTrue("yon-6", "bfcache loginPath kullaniyor", stripComments(idleHook).includes("window.location.replace(loginPath)"), "useIdleTimeout");

  // Super admin yuzeyinde /admin/giris'e kalinti referans OLMAMALI
  for (const p of [
    "src/app/super-admin/(authenticated)/layout.tsx",
    "src/components/super-admin/SuperAdminSidebar.tsx",
    "src/components/super-admin/SuperAdminShell.tsx",
    "src/app/super-admin/giris/SuperAdminLoginForm.tsx",
    "src/app/super-admin/_components/SuperAdminYetkisizView.tsx",
  ]) {
    okTrue("yon-kalinti", `/admin/giris yok: ${p.split("/").pop()}`, !stripComments(read(p)).includes("/admin/giris"), p);
  }
}

// ---------------------------------------------------------------------------
header("(g) Notr marka — root layout");
// ---------------------------------------------------------------------------
{
  const root = read("src/app/layout.tsx");
  const c = stripComments(root);
  // Kurum cozulurse panelin sekme basligi/favicon'u DEFAULT kurumun markasi
  // olurdu (x-tenant-slug yok -> getCurrentTenantOrNull "default"a duser).
  okTrue("marka", "root layout super admin host'unu taniyor", c.includes("isSuperAdminHost(headers().get(\"host\")"), "layout");
  okTrue("marka", "notr baslik", c.includes('title: "Platform Yönetimi"'), "layout");
  okTrue("marka", "noindex", c.includes("robots: { index: false, follow: false }"), "layout");
  // Kontrol, tenant cozumunden ONCE olmali
  okTrue(
    "marka",
    "kontrol getCurrentTenantOrNull'dan ONCE",
    c.indexOf("isSuperAdminHost") < c.indexOf("getCurrentTenantOrNull()"),
    "sira"
  );
}

// ---------------------------------------------------------------------------
header("(h) Kural (b) — diger host'larda /super-admin KAPALI");
// ---------------------------------------------------------------------------
{
  const mw = stripComments(read("src/middleware.ts"));

  okTrue("kural-b", "kural var", mw.includes('if (!superAdminHost && pathname.startsWith("/super-admin"))'), "middleware");

  // 🔴 YONLENDIRME OLMAMALI: kural (b) HER host'ta gecerli, bir 301 super
  // admin adresini her musteri domaininden yayinlardi.
  const bStart = mw.indexOf("if (!superAdminHost");
  const bBlock = mw.slice(bStart, bStart + 200);
  okTrue("kural-b", "blokta redirect YOK", !bBlock.includes("redirect"), "middleware");
  okTrue("kural-b", "notFound() donuyor", bBlock.includes("return notFound();"), "middleware");

  // Iki kural da auth/CSP kurulumundan ONCE
  okTrue("kural-b", "createServerClient'tan ONCE", mw.indexOf("if (!superAdminHost") < mw.indexOf("createServerClient("), "sira");

  // Kural (b) gelince fail-closed sartindaki /super-admin dali ULASILAMAZ
  // oldu (custom_domain host'u super admin host'u olamaz) -> temizlendi.
  okTrue("kural-b", "olu fail-closed dali temizlendi", !mw.includes('pathname.startsWith("/admin") || pathname.startsWith("/super-admin")'), "middleware");
}

// ---------------------------------------------------------------------------
header("(i) API host guard — 8 route, 10 handler");
// ---------------------------------------------------------------------------
{
  // 🔴 NEDEN AYRI KATMAN: middleware matcher'i `/api/`'yi disliyor, yani
  // kural (b) API rotalarina HIC ugramaz. Yalniz middleware'e konsaydi
  // panelin UI'si tasinmis ama tehlikeli API yuzeyi her musteri
  // domaininde acik kalmis olurdu.
  const guardSrc = read("src/lib/super-admin/api-host-guard.ts");
  okTrue("api", "helper var", guardSrc.includes("export function requireSuperAdminHost"), "api-host-guard");
  okTrue("api", "host disi -> 404 (403 degil)", stripComments(guardSrc).includes("status: 404"), "api-host-guard");
  okTrue("api", "Origin uyusmazligi -> 403", stripComments(guardSrc).includes("status: 403"), "api-host-guard");

  // DOSYADAN SAY: dokuzuncu route eklenip guard unutulursa bu blok kirilir.
  const routes = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") routes.push(full);
    }
  };
  walk("src/app/api/super-admin");

  ok("api", "route dosyasi sayisi", routes.length, 8, "api/super-admin");

  let handlers = 0;
  let guards = 0;
  for (const r of routes) {
    const src = read(r);
    const code = stripComments(src);
    const h = (src.match(/^export async function (GET|POST|PUT|PATCH|DELETE)/gm) || []).length;
    const g = (code.match(/const denied = requireSuperAdminHost\(/g) || []).length;
    handlers += h;
    guards += g;
    const short = r.replace("src/app/api/super-admin/", "");
    ok("api", `${short}: her handler korunuyor`, g, h, `${h} handler`);
    okTrue("api", `${short}: helper import edildi`, code.includes('from "@/lib/super-admin/api-host-guard"'), short);

    // Host kapisi AUTH'tan ONCE olmali: reddedilecek istek icin Supabase
    // istemcisi kurup getUser() cagirmak bosa is.
    //
    // ⚠️ SIRA HANDLER GOVDESI ICINDE olculur, dosya genelinde DEGIL:
    // cogu route'ta lokal `requireSuperAdmin` helper'i handler'in USTUNDE
    // tanimli ve icinde `auth.getUser()` geciyor. Dosya genelinde bakmak
    // sahte FAIL veriyordu (ilk olcumde 6 tane).
    for (const body of src.split(/^export async function /m).slice(1)) {
      const method = body.slice(0, body.indexOf("("));
      const bodyCode = stripComments(body);
      const gi = bodyCode.indexOf("requireSuperAdminHost(");
      const authAt = ["auth.getUser()", "requireSuperAdmin()"]
        .map((t) => bodyCode.indexOf(t))
        .filter((i) => i !== -1);
      const ai = authAt.length > 0 ? Math.min(...authAt) : Infinity;
      okTrue("api", `${short} ${method}: host kapisi auth'tan ONCE`, gi !== -1 && gi < ai, short);
    }
  }
  ok("api", "toplam handler", handlers, 10, "8 dosya");
  ok("api", "toplam guard", guards, handlers, "birebir");
}

// ---------------------------------------------------------------------------
header("(j) Origin kontrolu — ayni-site CSRF kapisi");
// ---------------------------------------------------------------------------
{
  const HOST = "superadminpanel.buyukdirilis.org.tr";

  ok("origin", "ayni host (https)", isSameHostOrigin(`https://${HOST}`, HOST), true, "https");
  ok("origin", "ayni host (http, yerel)", isSameHostOrigin(`http://${HOST}`, HOST), true, "http");
  ok("origin", "port dahil eslesme", isSameHostOrigin("http://superadminpanel.lvh.me:3000", "superadminpanel.lvh.me:3000"), true, "portlu");
  ok("origin", "buyuk/kucuk harf", isSameHostOrigin(`https://${HOST.toUpperCase()}`, HOST), true, "case");

  // 🔴 ASIL SENARYO: default kurumun sitesindeki XSS. Ayni SITE oldugu icin
  // sameSite=lax cerezi GONDERIR; bu kontrol o istegi eler.
  ok("origin", "apex (ayni site, FARKLI origin) reddedilir", isSameHostOrigin("https://buyukdirilis.org.tr", HOST), false, "apex");
  ok("origin", "musteri domaini reddedilir", isSameHostOrigin("https://kurmayteknoloji.com", HOST), false, "musteri");
  ok("origin", "kurum subdomain'i reddedilir", isSameHostOrigin("https://kurmay.buyukdirilis.org.tr", HOST), false, "subdomain");
  ok("origin", "port farki reddedilir", isSameHostOrigin("http://superadminpanel.lvh.me:3001", "superadminpanel.lvh.me:3000"), false, "port");

  // Fail-closed: bicimsiz / null / bos
  for (const bad of ["null", "", "javascript:alert(1)", "not a url", "//evil.com"]) {
    ok("origin", `bicimsiz reddedilir: "${bad}"`, isSameHostOrigin(bad, HOST), false, bad);
  }
  ok("origin", "null girdi reddedilir", isSameHostOrigin(null, HOST), false, "null");

  // Origin YOKLUGU kabul edilir: tarayici disi cagrilar bu basligi
  // gondermez ve onlarda CSRF yoktur (kurbanin cerezi yok).
  const guardSrc = stripComments(read("src/lib/super-admin/api-host-guard.ts"));
  okTrue("origin", "Origin yoklugu kabul ediliyor", guardSrc.includes("origin !== null && !isSameHostOrigin(origin, host)"), "api-host-guard");
}

// ---------------------------------------------------------------------------
header("(k) Yonlendirme 7-8 — giris sonrasi hedef");
// ---------------------------------------------------------------------------
{
  const mw = stripComments(read("src/middleware.ts"));
  const form = stripComments(read("src/app/admin/giris/AdminLoginForm.tsx"));

  // Kural (b) sonrasi tenant host'unda /super-admin 404 — oraya yollamak
  // kullaniciyi 404'e atmak olurdu.
  okTrue("yon-7", "middleware next=/super-admin'i eliyor", mw.includes('!rawNext.startsWith("/super-admin")'), "middleware");
  okTrue("yon-7", "middleware hedefi daima /admin", mw.includes('url.pathname = safeNext ? rawNext! : "/admin";'), "middleware");
  okTrue("yon-7", "middleware artik /super-admin'e YOLLAMIYOR", !mw.includes('url.pathname = isSuperAdmin ? "/super-admin"'), "middleware");
  // Hedef secimi kalmadigi icin RPC de gereksiz — her giristen biri eksildi.
  okTrue("yon-7", "is_super_admin RPC'si kaldirildi", !mw.includes('"is_super_admin"'), "middleware");

  okTrue("yon-8", "form next=/super-admin'i eliyor", form.includes('!next.startsWith("/super-admin")'), "AdminLoginForm");
  okTrue("yon-8", "form hedefi daima /admin", form.includes('router.push(isSafeNext(rawNext) ? rawNext : "/admin")'), "AdminLoginForm");
  okTrue("yon-8", "form is_super_admin RPC'si kaldirildi", !form.includes("is_super_admin"), "AdminLoginForm");

  // Panelin adresi kurum host'larindaki giris yuzeyinde ANILMAMALI:
  // o sayfa her musteri domaininde acik.
  for (const p of ["src/middleware.ts", "src/app/admin/giris/AdminLoginForm.tsx", "src/app/admin/giris/page.tsx"]) {
    okTrue("yon-8", `panel host'u anilmiyor: ${p.split("/").pop()}`, !stripComments(read(p)).includes(SUPER_ADMIN_SUBDOMAIN), p);
  }
}

// ---------------------------------------------------------------------------
header("(l) /api/contact — super admin host'unda KAPALI");
// ---------------------------------------------------------------------------
{
  // Kural (a)'nin butun anlami "bu host panelden baska HICBIR SEY yapmaz".
  // Anlamli cevap veren tek bir uc nokta bile host'un VARLIGINI dogrular.
  const guardSrc = read("src/lib/super-admin/api-host-guard.ts");
  okTrue("contact", "ters helper var", guardSrc.includes("export function rejectSuperAdminHost"), "api-host-guard");

  const contact = stripComments(read("src/app/api/contact/route.ts"));
  okTrue("contact", "route ters helper'i cagiriyor", contact.includes("const denied = rejectSuperAdminHost(req);"), "contact");
  okTrue("contact", "cagri body parse'tan ONCE", contact.indexOf("rejectSuperAdminHost(") < contact.indexOf("await req.text()"), "sira");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
