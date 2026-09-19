/**
 * Super admin ayri host testi — Deploy 1 (19 Eylul 2026).
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
 * BU TEST NEYI DOGRULAR (Deploy 1 kapsami):
 *   (a) parseHostname — super_admin tipi, tenant'tan AYRI
 *   (b) fail-closed — supheli her host super admin DEGIL
 *   (c) slug rezervasyonu — o alt alanla kurum olusturulamaz
 *   (d) planTenantQuery null — o host'ta kurum SORULMAZ
 *   (e) kural (a) — middleware'de, auth/CSP kurulumundan ONCE, 404
 *   (f) giris akisi — yeni sayfa tenant'a dokunmuyor, yonlendirmeler 1-6
 *   (g) notr marka — root layout o host'ta kurum cozmuyor
 *
 * ⚠️ KAPSAM SINIRI: kural (b) ("diger host'larda /super-admin KAPALI")
 *   DEPLOY 2'de gelecek — burada BILEREK sinanmiyor. Deploy 1'de eski
 *   adres calismaya devam ediyor ki gecis boyunca kilitlenme penceresi
 *   acilmasin.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir.
 */

import { readFileSync } from "node:fs";
import {
  getSuperAdminHost,
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
  const ruleBlock = code.slice(code.indexOf("superAdminHost"), code.indexOf("let tenantSlug"));
  okTrue("kural-a", "kural blogunda redirect YOK", !ruleBlock.includes("redirect"), "middleware");

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

  // Statik varliklar ve /api matcher'in disinda -> panel calisir
  okTrue("kural-a", "matcher statikleri disliyor", code.includes("_next/static"), "matcher");
  okTrue("kural-a", "matcher /api'yi disliyor", code.includes("|api)"), "matcher");
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
header("(h) Deploy 2 kapsami — BU TURDA YOK (bilincli)");
// ---------------------------------------------------------------------------
{
  const mw = stripComments(read("src/middleware.ts"));
  // Kural (b) Deploy 2'de gelecek. Deploy 1'de eski adres CALISMAYA DEVAM
  // ETMELI ki gecis boyunca kilitlenme penceresi acilmasin. Bu kontrol,
  // kural (b)'nin yanlislikla Deploy 1'e sizmadigini dogrular.
  okTrue(
    "deploy-2",
    "kural (b) henuz YOK (eski adres acik kalmali)",
    !mw.includes('match.type !== "super_admin"'),
    "middleware"
  );
  // Ayni sekilde API host guard'i da Deploy 2'de
  const api = read("src/app/api/super-admin/delete-tenant/route.ts");
  okTrue("deploy-2", "API host guard'i henuz YOK", !stripComments(api).includes("isSuperAdminHost"), "delete-tenant");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
