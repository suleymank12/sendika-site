/**
 * GORSEL ZINCIRI testi — Faz 1 (21 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:gorsel-zinciri
 *   (= node scripts/test-gorsel-zinciri.mjs)
 *
 * ## NEDEN VAR
 *
 * Next'in gorsel ucu (`/_next/image`) izinli adresten gorseli SUNUCUDA
 * indirip sharp ile isliyor. Kural `*.supabase.co` idi — herhangi birinin
 * projesi: kimliksiz bir saldirgan kendi projesindeki AVIF ile sharp'in
 * libheif'ine (GHSA-2xp9-vwfh-vxw4, kritik RCE, glibc Linux) ulasabiliyordu.
 * Faz 1: kural YALNIZ bizim projemiz + sharp 0.35.4 + nginx sertlestirmesi.
 *
 * Kural UC yerde tuketiliyor ve biri digerinden genis kalirsa ya sayfa
 * 500'e duser (SafeImage genis → next/image "hostname is not configured"
 * firlatir) ya da paylasim gorseli olur (og genis → uc 400). Bu test ucunu
 * ve NEXT'IN KENDI ESLESTIRICISINI ayni adres kumesinde yarıştırır.
 *
 * ## BU TEST NEYI DOGRULAR
 *
 *   (a) storage-host saf mantigi — tam host esitligi, sonek/onek hileleri,
 *       port, kullanici bilgisi, yol, http
 *   (b) env — kural NEXT_PUBLIC_SUPABASE_URL'i izliyor; env yoksa fail-closed
 *   (c) next.config GERCEKTEN yuklenir — tek desen, joker yok, env yoksa
 *       build hatasi
 *   (d) 🔴 uc tuketici + Next'in match-remote-pattern'i ayni kararda
 *   (e) kaynak muhurleri — kopya kural yok, istemci env kalibi korunuyor
 *   (f) paket surumleri — sharp ≥0.35.4 (+ Linux ikilisi), sanitize-html,
 *       Tiptap hizali, markdown-it/linkify-it agactan cikti, next sabit
 *   (g) nginx parcalari (deploy/nginx) — ic baslik temizligi, WebSocket
 *       kapali, q=75 ↔ OG_IMAGE_QUALITY, hiz siniri, sablonla ayni adlar
 *   (h) budama betigi + npm script'leri
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import {
  STORAGE_PUBLIC_PATH_PREFIX,
  hostFromSupabaseUrl,
  isOwnPublicStorageUrl,
  ownStorageHost,
} from "../src/lib/storage-host.ts";
import { isNextImageSafeUrl } from "../src/lib/utils.ts";
import { OG_IMAGE_QUALITY, OG_IMAGE_WIDTH, isOptimizableStorageUrl } from "../src/lib/og-image.ts";
import {
  APP_UPSTREAM,
  NGINX_APP_SNIPPET,
  NGINX_IMAGE_SNIPPET,
  NGINX_RATE_ZONE_CONF,
  NGINX_STATIC_SNIPPET,
  buildNginxConfig,
} from "../src/lib/super-admin/setup-checklist.ts";

const require = createRequire(import.meta.url);
const { hasRemoteMatch } = require("next/dist/shared/lib/match-remote-pattern");

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
    console.log(`          girdi   : ${input}`);
    console.log(`          cikti   : ${a}`);
    console.log(`          beklenen: ${e}`);
  }
}
const okTrue = (g, n, c, i) => ok(g, n, c === true, true, i);
const header = (t) => console.log(`\n--- ${t}`);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}
const stripHashComments = (src) =>
  src
    .split("\n")
    .map((l) => l.replace(/#.*$/, ""))
    .join("\n");

const HOST = "ornekproje.supabase.co";
const OWN = `https://${HOST}${STORAGE_PUBLIC_PATH_PREFIX}images/t1/news/a.jpg`;
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${HOST}`;

// ---------------------------------------------------------------------------
header("(a) storage-host — saf mantik");
// ---------------------------------------------------------------------------
{
  ok("host", "proje adresinden host", hostFromSupabaseUrl(`https://${HOST}`), HOST, "url");
  ok("host", "sondaki / ve bosluk sorun degil", hostFromSupabaseUrl(`  https://${HOST}/  `), HOST, "url");
  ok("host", "bos → null", hostFromSupabaseUrl(""), null, '""');
  ok("host", "undefined → null", hostFromSupabaseUrl(undefined), null, "undefined");
  ok("host", "bozuk → null (throw yok)", hostFromSupabaseUrl("adres degil"), null, "bozuk");

  const vakalar = [
    ["kendi public nesnemiz", OWN, true],
    ["BUYUK HARF host (URL kucultur)", OWN.replace(HOST, HOST.toUpperCase()), true],
    ["🔴 BASKA Supabase projesi", OWN.replace("ornekproje", "saldirgan"), false],
    ["🔴 sonek hilesi (host.saldirgan.test)", OWN.replace(HOST, `${HOST}.saldirgan.test`), false],
    ["🔴 onek hilesi (xornekproje)", OWN.replace("ornekproje", "xornekproje"), false],
    ["🔴 kullanici bilgisi hilesi (@saldirgan)", OWN.replace(HOST, `${HOST}@saldirgan.test`), false],
    ["kullanici bilgisi (a@host)", OWN.replace(HOST, `a@${HOST}`), false],
    ["ozel port", OWN.replace(HOST, `${HOST}:8443`), false],
    ["acik :443 (varsayilan, URL siler)", OWN.replace(HOST, `${HOST}:443`), true],
    ["http", OWN.replace("https", "http"), false],
    ["imzali yol (/sign/)", `https://${HOST}/storage/v1/object/sign/images/a.jpg`, false],
    ["render yolu", `https://${HOST}/storage/v1/render/image/public/images/a.jpg`, false],
    ["🔴 yol gezme (public/../sign)", `https://${HOST}/storage/v1/object/public/../sign/a.jpg`, false],
    ["goreli", "/storage/v1/object/public/a.jpg", false],
    ["bos", "", false],
    ["sayi", 42, false],
  ];
  for (const [ad, girdi, beklenen] of vakalar) {
    ok("kural", ad, isOwnPublicStorageUrl(girdi), beklenen, String(girdi));
  }
}

// ---------------------------------------------------------------------------
header("(b) env — kural projeyi izliyor, env yoksa fail-closed");
// ---------------------------------------------------------------------------
{
  ok("env", "ownStorageHost = env host'u", ownStorageHost(), HOST, "env");
  const onceki = process.env.NEXT_PUBLIC_SUPABASE_URL;

  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://baskaproje.supabase.co";
  ok("env", "env degisince kural degisir (eski host reddedilir)", isOwnPublicStorageUrl(OWN), false, "baskaproje");
  ok("env", "yeni host kabul edilir", isOwnPublicStorageUrl(OWN.replace("ornekproje", "baskaproje")), true, "baskaproje");

  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  ok("env", "🔴 env yok → host null", ownStorageHost(), null, "yok");
  ok("env", "🔴 env yok → SafeImage uzak adresi REDDEDER (fallback)", isNextImageSafeUrl(OWN), false, "yok");
  ok("env", "🔴 env yok → og optimize ETMEZ (ham adres)", isOptimizableStorageUrl(OWN), false, "yok");
  ok("env", "env yok → site-goreli yol yine gecer", isNextImageSafeUrl("/placeholder-logo.png"), true, "yok");

  process.env.NEXT_PUBLIC_SUPABASE_URL = onceki;
}

// ---------------------------------------------------------------------------
header("(c) next.config — gercekten yuklenir");
// ---------------------------------------------------------------------------
let config = null;
{
  // K7-B (21 Eylul 2026): next.config.mjs TENANT_HEADER_SECRET yoksa build'i
  // durduruyor. Bu test .env.local OKUMAZ — bu blok boyunca TEST degeri verilir,
  // blok sonunda geri alinir. Boylece asagidaki "Supabase env yok → HATA"
  // kontrolleri sir kapisina degil, sinadiklari kapiya takilir. (Sir kapisinin
  // kendisi test:tenant-proof'ta sinaniyor.)
  const oncekiSir = process.env.TENANT_HEADER_SECRET;
  process.env.TENANT_HEADER_SECRET = "gorsel-zinciri-test-degeri-".padEnd(40, "x");
  config = (await import(`../next.config.mjs?v=${Date.now()}`)).default;
  const desenler = config.images?.remotePatterns;
  ok("config", "tek desen", Array.isArray(desenler) && desenler.length, 1, JSON.stringify(desenler));
  ok(
    "config",
    "🔴 desen = yalniz bizim proje, https, varsayilan port, public yol",
    desenler?.[0],
    { protocol: "https", hostname: HOST, port: "", pathname: "/storage/v1/object/public/**" },
    JSON.stringify(desenler?.[0])
  );
  okTrue("config", "🔴 hostname'de joker YOK", !String(desenler?.[0]?.hostname).includes("*"), "hostname");
  okTrue("config", "images.domains kullanilmiyor", config.images?.domains === undefined, "domains");
  okTrue("config", "deviceSizes tanimsiz (1200 varsayilan listede)", config.images?.deviceSizes === undefined, "deviceSizes");
  // K5 (21 Eylul 2026): uygulama da yalniz q=75'i kabul eder — nginx'e
  // bagimli kalmadan. og:image kalitesiyle AYNI olmali, yoksa paylasim
  // gorselleri "q parameter (quality) of … is not allowed" ile 400 olur.
  ok("config", "🔴 images.qualities = [OG_IMAGE_QUALITY] (uygulama q≠75'i reddeder)", config.images?.qualities, [OG_IMAGE_QUALITY], JSON.stringify(config.images?.qualities));

  const onceki = process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  let hata = null;
  try {
    await import(`../next.config.mjs?yok=${Date.now()}`);
  } catch (e) {
    hata = String(e && e.message);
  }
  okTrue("config", "🔴 env yoksa config HATA firlatir (build durur)", !!hata && hata.includes("NEXT_PUBLIC_SUPABASE_URL"), String(hata));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "bozuk-adres";
  hata = null;
  try {
    await import(`../next.config.mjs?bozuk=${Date.now()}`);
  } catch (e) {
    hata = String(e && e.message);
  }
  okTrue("config", "env bozuksa da HATA", !!hata, String(hata));
  process.env.NEXT_PUBLIC_SUPABASE_URL = onceki;
  if (oncekiSir === undefined) delete process.env.TENANT_HEADER_SECRET;
  else process.env.TENANT_HEADER_SECRET = oncekiSir;
}

// ---------------------------------------------------------------------------
header("(d) 🔴 uc tuketici + Next'in kendi eslestiricisi AYNI kararda");
// ---------------------------------------------------------------------------
{
  const desenler = config.images.remotePatterns;
  const next = (u) => {
    try {
      return hasRemoteMatch([], desenler, new URL(u));
    } catch {
      return false;
    }
  };
  const kume = [
    OWN,
    OWN.replace(HOST, HOST.toUpperCase()),
    OWN.replace(HOST, `${HOST}:443`),
    OWN.replace("ornekproje", "saldirgan"),
    OWN.replace(HOST, `${HOST}.saldirgan.test`),
    OWN.replace("ornekproje", "xornekproje"),
    OWN.replace(HOST, `${HOST}:8443`),
    OWN.replace("https", "http"),
    `https://${HOST}/storage/v1/object/sign/images/a.jpg`,
    `https://${HOST}/storage/v1/object/public/../sign/a.jpg`,
    `https://${HOST}/storage/v1/render/image/public/a.jpg`,
    "https://evil.test/storage/v1/object/public/a.jpg",
    "https://supabase.co/storage/v1/object/public/a.jpg",
  ];
  let esit = 0;
  const ayri = [];
  for (const u of kume) {
    const s = isNextImageSafeUrl(u);
    const o = isOptimizableStorageUrl(u);
    const n = next(u);
    if (s === o && o === n) esit++;
    else ayri.push(`${u} safe=${s} og=${o} next=${n}`);
  }
  ok("uyum", `${kume.length} adreste SafeImage = og = Next`, ayri, [], ayri.join(" | "));
  ok("uyum", "kararlarin sayisi", esit, kume.length, "esit");

  // Kullanici bilgili adres: Next'in eslestiricisi userinfo'ya BAKMIYOR,
  // biz reddediyoruz. Yon GUVENLI olmali: bizim "evet" dedigimiz her yerde
  // Next de "evet" demeli (tersi 500 demek). Burada biz "hayir", Next "evet".
  const userinfo = OWN.replace(HOST, `a@${HOST}`);
  ok("uyum", "userinfo: biz daha SIKI (safe=false)", isNextImageSafeUrl(userinfo), false, userinfo);
  ok("uyum", "userinfo: Next eslestiricisi izin verirdi (belgelenen fark)", next(userinfo), true, userinfo);
  const ihlal = [...kume, userinfo].filter((u) => isNextImageSafeUrl(u) && !next(u));
  ok("uyum", "🔴 SafeImage'in kabul ettigi HER adresi Next de kabul ediyor (500 yok)", ihlal, [], ihlal.join(" | "));
}

// ---------------------------------------------------------------------------
header("(e) kaynak muhurleri");
// ---------------------------------------------------------------------------
{
  const utils = stripComments(read("src/lib/utils.ts"));
  const og = stripComments(read("src/lib/og-image.ts"));
  const sh = read("src/lib/storage-host.ts");
  const cfg = stripComments(read("next.config.mjs"));

  okTrue("kaynak", "utils.ts kurali storage-host'tan aliyor", utils.includes('from "./storage-host.ts"') && utils.includes("isOwnPublicStorageUrl(value)"), "utils.ts");
  okTrue("kaynak", "🔴 utils.ts'te kopya host kurali YOK", !/supabase\\?\.co/.test(utils), "utils.ts");
  okTrue("kaynak", "og-image.ts kurali storage-host'tan aliyor", og.includes('from "./storage-host.ts"') && og.includes("return isOwnPublicStorageUrl(raw);"), "og-image.ts");
  okTrue("kaynak", "🔴 og-image.ts'te kopya host kurali YOK", !/supabase\\?\.co/.test(og), "og-image.ts");
  // Next istemci paketinde YALNIZ bu kalibi literale ceviriyor.
  okTrue("kaynak", "🔴 storage-host env'i istemcinin cevirebildigi kalipla okuyor", stripComments(sh).includes("hostFromSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)"), "storage-host.ts");
  okTrue("kaynak", "next.config joker icermiyor", !cfg.includes("*.supabase.co"), "next.config.mjs");
  okTrue("kaynak", "next.config ayni env'i okuyor", cfg.includes("process.env.NEXT_PUBLIC_SUPABASE_URL"), "next.config.mjs");

  // nginx q=75 filtresinin ON SARTI: hicbir next/image cagrisi baska kalite
  // istemiyor. `quality={…}` eklenirse o gorsel canlida 400 olur.
  const { readdirSync, statSync } = await import("node:fs");
  const tsx = [];
  const gez = (d) => {
    for (const ad of readdirSync(new URL(`../${d}`, import.meta.url))) {
      const yol = `${d}/${ad}`;
      if (statSync(new URL(`../${yol}`, import.meta.url)).isDirectory()) gez(yol);
      else if (/\.(tsx|ts)$/.test(ad)) tsx.push(yol);
    }
  };
  gez("src");
  const kaliteli = tsx.filter((f) => /\bquality=\{/.test(stripComments(read(f))));
  ok("kaynak", "🔴 kodda next/image quality={…} YOK (nginx yalniz q=75 geciriyor)", kaliteli, [], kaliteli.join(", "));
  ok("kaynak", "og:image kalitesi 75", OG_IMAGE_QUALITY, 75, "OG_IMAGE_QUALITY");
  ok("kaynak", "og:image genisligi 1200", OG_IMAGE_WIDTH, 1200, "OG_IMAGE_WIDTH");
}

// ---------------------------------------------------------------------------
header("(f) paket surumleri");
// ---------------------------------------------------------------------------
{
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json")).packages;
  const surum = (v) => (v || "0.0.0").replace(/^[^\d]*/, "").split(".").map(Number);
  const enAz = (v, min) => {
    const a = surum(v), b = surum(min);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
    return true;
  };

  const sharp = lock["node_modules/sharp"]?.version;
  okTrue("paket", `🔴 sharp ≥ 0.35.4 (libheif, GHSA-rgj7-g3m4-5g8c) — kurulu ${sharp}`, enAz(sharp, "0.35.4"), sharp);
  okTrue("paket", "package.json sharp alt siniri ≥ 0.35.4", enAz(pkg.dependencies.sharp, "0.35.4"), pkg.dependencies.sharp);
  const linux = lock["node_modules/@img/sharp-linux-x64"]?.version;
  ok("paket", "🔴 sunucunun ikilisi (@img/sharp-linux-x64) sharp ile ayni surum", linux, sharp, "lock");
  okTrue("paket", "libvips linux ikilisi lock'ta", !!lock["node_modules/@img/sharp-libvips-linux-x64"]?.version, "lock");

  const sh = lock["node_modules/sanitize-html"]?.version;
  okTrue("paket", `sanitize-html ≥ 2.17.7 — kurulu ${sh}`, enAz(sh, "2.17.7"), sh);

  const tiptap = Object.entries(lock).filter(([k]) => /(^|\/)node_modules\/@tiptap\/[^/]+$/.test(k));
  const tiptapSurumler = [...new Set(tiptap.map(([, v]) => v.version))];
  ok("paket", `🔴 butun @tiptap/* ayni surumde (${tiptap.length} paket)`, tiptapSurumler.length, 1, tiptapSurumler.join(","));
  okTrue("paket", `Tiptap ≥ 3.30.5 (ReDoS + __proto__) — ${tiptapSurumler[0]}`, enAz(tiptapSurumler[0], "3.30.5"), tiptapSurumler[0]);
  const dogrudanTiptap = Object.entries(pkg.dependencies).filter(([k]) => k.startsWith("@tiptap/"));
  okTrue("paket", "package.json'daki @tiptap/* alt sinirlari hizali", dogrudanTiptap.every(([, v]) => v === `^${tiptapSurumler[0]}`), JSON.stringify(dogrudanTiptap));

  const markdown = Object.keys(lock).filter((k) => /\/(markdown-it|linkify-it)$/.test(k));
  ok("paket", "markdown-it / linkify-it agactan cikti", markdown, [], markdown.join(","));

  ok("paket", "next lock'ta package.json'daki SABIT surumde (bu fazda degismez)", lock["node_modules/next"]?.version, pkg.dependencies.next, "next");
}

// ---------------------------------------------------------------------------
header("(g) nginx parcalari — deploy/nginx");
// ---------------------------------------------------------------------------
{
  const yollar = {
    zone: `deploy/nginx/${NGINX_RATE_ZONE_CONF}`,
    app: `deploy/nginx/${NGINX_APP_SNIPPET}`,
    img: `deploy/nginx/${NGINX_IMAGE_SNIPPET}`,
    statik: `deploy/nginx/${NGINX_STATIC_SNIPPET}`,
  };
  for (const [ad, yol] of Object.entries(yollar)) {
    okTrue("nginx", `dosya repoda: ${yol}`, existsSync(new URL(`../${yol}`, import.meta.url)), ad);
  }
  const zone = stripHashComments(read(yollar.zone));
  const app = stripHashComments(read(yollar.app));
  const img = stripHashComments(read(yollar.img));
  const statik = stripHashComments(read(yollar.statik));

  // --- uygulama parcasi
  okTrue("nginx", "proxy_pass = APP_UPSTREAM", app.includes(`proxy_pass ${APP_UPSTREAM};`), "app");
  for (const baslik of [
    "x-tenant-slug",
    "x-nonce",
    "Content-Security-Policy",
    "Content-Security-Policy-Report-Only",
    "x-middleware-subrequest",
    "x-nextjs-data",
  ]) {
    okTrue("nginx", `🔴 gelen '${baslik}' uygulamaya ULASMAZ (bos deger)`, app.includes(`proxy_set_header ${baslik} "";`), "app");
  }
  okTrue("nginx", "🔴 Upgrade iletilmez", app.includes('proxy_set_header Upgrade "";') && !app.includes("$http_upgrade"), "app");
  okTrue("nginx", "🔴 Connection 'upgrade' yok", app.includes('proxy_set_header Connection "";') && !/Connection\s+'?upgrade/i.test(app), "app");
  for (const satir of [
    "proxy_http_version 1.1;",
    "proxy_set_header Host $host;",
    "proxy_set_header X-Forwarded-Host $host;",
    "proxy_set_header X-Forwarded-Port 443;",
    "proxy_set_header X-Real-IP $remote_addr;",
    "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "proxy_set_header X-Forwarded-Proto $scheme;",
  ]) {
    okTrue("nginx", `eski blogun ayari korundu: ${satir}`, app.includes(satir), "app");
  }

  // --- gorsel ucu parcasi
  okTrue("nginx", "location /_next/image", /location \/_next\/image \{/.test(img), "img");
  okTrue("nginx", `🔴 q ≠ ${OG_IMAGE_QUALITY} → 400 (og:image kalitesiyle AYNI)`, img.includes(`if ($arg_q != "${OG_IMAGE_QUALITY}") {`) && /if \(\$arg_q[^)]*\) \{\s*return 400;\s*\}/.test(img), "img");
  const lr = img.match(/limit_req zone=(\w+) burst=(\d+) delay=(\d+);/);
  okTrue("nginx", "🔴 hiz siniri var (limit_req zone burst delay)", !!lr, "img");
  const zm = zone.match(/limit_req_zone \$binary_remote_addr zone=(\w+):(\d+)m rate=(\d+)r\/s;/);
  okTrue("nginx", "bolge tanimi IP basina", !!zm, "zone");
  ok("nginx", "bolge adi iki dosyada ayni", lr?.[1], zm?.[1], `${lr?.[1]} / ${zm?.[1]}`);
  ok("nginx", "oran 10 istek/sn", zm && Number(zm[3]), 10, "rate");
  okTrue("nginx", "burst ≥ 4 anasayfa (olculen 14 gorsel × 4 = 56) ve delay < burst", !!lr && Number(lr[3]) >= 56 && Number(lr[2]) > Number(lr[3]), JSON.stringify(lr));
  okTrue("nginx", "429 donuyor ve WARN loglaniyor", img.includes("limit_req_status 429;") && img.includes("limit_req_log_level warn;"), "img");
  okTrue("nginx", "gorsel ucu da ayni vekil parcasini kullaniyor", img.includes(`include ${NGINX_APP_SNIPPET};`), "img");
  okTrue("nginx", "gorsel ucunda tek basina proxy_set_header YOK (miras tuzagi)", !img.includes("proxy_set_header"), "img");
  // --- statik parca (K7-A, 21 Eylul 2026): /_next/static/ DISKTEN.
  // 🔴 Asagidaki muhurlerin cogu OFF-BY-SLASH icin: location ya da alias
  // sonundaki "/" dusurse `/_next/static../` ile .next/ alti (sunucu kodu,
  // manifestler) disari acilir — yerel nginx 1.18.0'da olculdu, hicbir
  // gorunur belirti vermez; yalniz bu muhurler yakalar.
  const locSatiri = (statik.match(/^\s*location\b[^\n{]*\{/m) || [""])[0];
  const aliasDeger = (statik.match(/^\s*alias\s+(\S+?);/m) || [])[1] || "";
  // Tek location, prefix `^~`: ileride eklenecek bir regex location bu blogu ezmesin
  okTrue("nginx", "statik: location '^~' ile", /^\s*location\s+\^~\s/.test(locSatiri), locSatiri.trim());
  // location "/_next/static/" ile bitiyor — sondaki "/" yoksa off-by-slash
  okTrue("nginx", "🔴 statik: location '/_next/static/' ile bitiyor (sondaki / ZORUNLU)", /\s\/_next\/static\/\s*\{$/.test(locSatiri), locSatiri.trim());
  // alias "/" ile bitiyor — location'la birlikte ikisi de "/" ile bitmeli
  okTrue("nginx", "🔴 statik: alias degeri '/' ile bitiyor", aliasDeger.endsWith("/"), aliasDeger);
  // alias deploy akisinin yazdigi dizin (rsync → /var/www/sendika-site/.next/static/)
  ok("nginx", "statik: alias hedefi canli dizin", aliasDeger, "/var/www/sendika-site/.next/static/", aliasDeger);
  // proxy_pass olursa olmayan dosya yine uygulamaya gider — K7-A'nin tum amaci bozulur
  okTrue("nginx", "🔴 statik: proxy_pass YOK (olmayan dosya uygulamaya ULASMAZ)", !statik.includes("proxy_pass"), "statik");
  // try_files bilerek yok: alias zaten 404 donuyor; alias+try_files trac #97 deseni
  okTrue("nginx", "statik: try_files YOK", !statik.includes("try_files"), "statik");
  // nosniff Next'in statik yanitinda vardi; diskten servis edilince kaybolmasin (404'te de)
  okTrue("nginx", "statik: X-Content-Type-Options nosniff always", /add_header\s+X-Content-Type-Options\s+"nosniff"\s+always;/.test(statik), "statik");
  // Cache-Control'de always olursa 404'e bir yillik immutable yazilir → gecici 404 alan parca kalici zehirlenir
  const ccSatiri = (statik.match(/^\s*add_header\s+Cache-Control\b[^\n]*$/m) || [""])[0];
  okTrue("nginx", "🔴 statik: Cache-Control satirinda 'always' YOK", !!ccSatiri && !/\balways\b/.test(ccSatiri), ccSatiri.trim());
  okTrue("nginx", "statik: Cache-Control bir yillik immutable", ccSatiri.includes('"public, max-age=31536000, immutable"'), ccSatiri.trim());

  for (const [ad, metin] of [["zone", zone], ["app", app], ["img", img], ["statik", statik]]) {
    ok("nginx", `${ad}: suslu parantez dengeli`, metin.split("{").length, metin.split("}").length, ad);
  }

  // --- sablon (yeni musteri domaini) ayni parcalari kullaniyor
  const sablon = buildNginxConfig("ornek.org");
  okTrue("nginx", "sablon gorsel ucu parcasini include ediyor", sablon.includes(`include ${NGINX_IMAGE_SNIPPET};`), "sablon");
  okTrue("nginx", "sablon location / → uygulama parcasi", sablon.includes(`include ${NGINX_APP_SNIPPET};`), "sablon");
  okTrue("nginx", "sablon statik parcasini include ediyor (K7-A)", sablon.includes(`include ${NGINX_STATIC_SNIPPET};`), "sablon");
}

// ---------------------------------------------------------------------------
header("(h) budama betigi + npm script'leri");
// ---------------------------------------------------------------------------
{
  const pkg = JSON.parse(read("package.json"));
  okTrue("betik", "scripts/gorsel-onbellek-budama.sh var", existsSync(new URL("../scripts/gorsel-onbellek-budama.sh", import.meta.url)), "betik");
  ok("betik", "test:gorsel-onbellek tanimli", pkg.scripts["test:gorsel-onbellek"], "bash scripts/test-gorsel-onbellek-budama.sh", "package.json");
  ok("betik", "test:gorsel-zinciri tanimli", pkg.scripts["test:gorsel-zinciri"], "node scripts/test-gorsel-zinciri.mjs", "package.json");
  const betik = read("scripts/gorsel-onbellek-budama.sh");
  okTrue("betik", "cron satiri betikte belgelenmis (/opt/build'den, canli dizine)", betik.includes("/opt/build/sendika-site/scripts/gorsel-onbellek-budama.sh /var/www/sendika-site/.next/cache/images"), "betik");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
