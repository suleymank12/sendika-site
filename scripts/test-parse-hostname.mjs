/**
 * parseHostname / normalizeCustomDomain tablo testi.
 *
 * CALISTIRMA:
 *   npm run test:hostname
 *   (= node scripts/test-parse-hostname.mjs)
 *
 * NEDEN VAR (regresyon kaydi):
 *   Canli bug — bir tenant'in custom_domain'i "kurmayteknoloji.com" iken
 *   https://www.kurmayteknoloji.com DEFAULT tenant'i aciyordu. parseHostname
 *   "www." on ekini yalnizca www.{apex} icin ele aliyordu; custom_domain
 *   dalinda www soyulmadigi icin DB lookup (.eq("custom_domain", host))
 *   eslesmiyor, sistem sessizce default'a dusuyordu. Ayni sorun
 *   www.{slug}.{apex} icin de vardi.
 *
 * --conditions=react-server GEREKMIYOR: tenant-hostname.ts saf string
 * modulu, "server-only" import etmiyor (test-sanitize.mjs'den farki bu).
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import {
  parseHostname,
  normalizeCustomDomain,
} from "../src/lib/tenant-hostname.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (test-sanitize.mjs ile ayni desen)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

/** @param {string} group @param {string} name @param {unknown} actual @param {unknown} expected @param {string} input */
function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name, input, out: a, problems: [`beklenen ${e}`] });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

/**
 * ROOT_DOMAIN'i case bazinda degistirir. getRootDomain() env'i HER CAGRIDA
 * okur (cache yok), bu yuzden guvenli.
 * @param {string} rootDomain @param {string} hostname @param {object} expected
 */
function check(rootDomain, hostname, expected) {
  process.env.NEXT_PUBLIC_ROOT_DOMAIN = rootDomain;
  ok(
    "parse",
    `${rootDomain} | ${hostname === "" ? "(bos)" : hostname}`,
    parseHostname(hostname),
    expected,
    hostname
  );
}

const PROD = "buyukdirilis.org.tr"; // coklu parcali TLD — asil canli ortam
const DEV = "lvh.me";

// ---------------------------------------------------------------------------
console.log("\n(a) APEX — www'lu ve www'suz\n");

check(PROD, "buyukdirilis.org.tr", { type: "apex" });
check(PROD, "www.buyukdirilis.org.tr", { type: "apex" });
check(PROD, "WWW.BuyukDirilis.ORG.TR", { type: "apex" }); // case-insensitive
check(PROD, "buyukdirilis.org.tr:443", { type: "apex" }); // port
check(PROD, "www.buyukdirilis.org.tr:443", { type: "apex" });
check(PROD, "  www.buyukdirilis.org.tr  ", { type: "apex" }); // bosluk

// ---------------------------------------------------------------------------
console.log("\n(b) SUBDOMAIN — www'lu ve www'suz\n");

check(PROD, "default.buyukdirilis.org.tr", { type: "subdomain", slug: "default" });
// DUZELEN: onceden sub = "www.default" -> coklu parca -> custom_domain -> default
check(PROD, "www.default.buyukdirilis.org.tr", { type: "subdomain", slug: "default" });
check(PROD, "test-abc.buyukdirilis.org.tr", { type: "subdomain", slug: "test-abc" });
check(PROD, "WWW.Test-ABC.buyukdirilis.org.tr", { type: "subdomain", slug: "test-abc" });
check(PROD, "default.buyukdirilis.org.tr:3000", { type: "subdomain", slug: "default" });

// Coklu parca slug kabul edilmez (www DISINDA) — eski davranis korunuyor
check(PROD, "a.b.buyukdirilis.org.tr", {
  type: "custom_domain",
  host: "a.b.buyukdirilis.org.tr",
});

// ---------------------------------------------------------------------------
console.log("\n(c) CUSTOM DOMAIN — asil bug\n");

check(PROD, "kurmayteknoloji.com", {
  type: "custom_domain",
  host: "kurmayteknoloji.com",
});
// CANLI BUG: onceden host "www.kurmayteknoloji.com" donerdi, DB'de eslesmez,
// tenant sessizce default'a duserdi.
check(PROD, "www.kurmayteknoloji.com", {
  type: "custom_domain",
  host: "kurmayteknoloji.com",
});
check(PROD, "WWW.KurmayTeknoloji.COM", {
  type: "custom_domain",
  host: "kurmayteknoloji.com",
});
check(PROD, "www.kurmayteknoloji.com:443", {
  type: "custom_domain",
  host: "kurmayteknoloji.com",
});
check(PROD, "www.alt.kurmayteknoloji.com", {
  type: "custom_domain",
  host: "alt.kurmayteknoloji.com",
});

// ---------------------------------------------------------------------------
console.log("\n(d) LOCALHOST / DEV (lvh.me) / port'lu varyantlar\n");

check(PROD, "localhost", { type: "apex" });
check(PROD, "localhost:3000", { type: "apex" });
check(PROD, "127.0.0.1", { type: "apex" });
check(PROD, "127.0.0.1:3000", { type: "apex" });
check(PROD, "", { type: "apex" });

check(DEV, "lvh.me", { type: "apex" });
check(DEV, "lvh.me:3000", { type: "apex" });
check(DEV, "www.lvh.me:3000", { type: "apex" });
check(DEV, "test-abc.lvh.me:3000", { type: "subdomain", slug: "test-abc" });
check(DEV, "www.test-abc.lvh.me:3000", { type: "subdomain", slug: "test-abc" });

check(PROD, "pr-1-suleyman.vercel.app", { type: "apex" });
check(PROD, "www.pr-1-suleyman.vercel.app", { type: "apex" });

// ---------------------------------------------------------------------------
console.log("\n(e) stripWww SINIR DURUMLARI — asiri soyma OLMAMALI\n");

// "www" tek etiket: kalanda nokta yok -> DOKUNULMAZ (aksi halde bos string)
check(PROD, "www", { type: "custom_domain", host: "www" });
// "www.com": kalan ("com") noktasiz -> DOKUNULMAZ
check(PROD, "www.com", { type: "custom_domain", host: "www.com" });
// icinde gecen ama on ek OLMAYAN www
check(PROD, "mywww.com", { type: "custom_domain", host: "mywww.com" });
check(PROD, "site.www.com", { type: "custom_domain", host: "site.www.com" });
// Cift www: TEK SEVIYE soyulur -> www.{apex} kalir -> sub === "www" guard'i
// devreye girer, rezerve "www" slug'i DONMEZ (eski davranisla ayni sonuc)
check(PROD, "www.www.buyukdirilis.org.tr", {
  type: "custom_domain",
  host: "www.buyukdirilis.org.tr",
});

// ---------------------------------------------------------------------------
console.log("\n(f) normalizeCustomDomain — YAZMA tarafi\n");

/** @param {unknown} input @param {string|null} expected */
function checkNorm(input, expected) {
  ok(
    "normalize",
    JSON.stringify(input),
    normalizeCustomDomain(input),
    expected,
    String(input)
  );
}

checkNorm("kurmayteknoloji.com", "kurmayteknoloji.com");
checkNorm("www.kurmayteknoloji.com", "kurmayteknoloji.com");
checkNorm("  WWW.KurmayTeknoloji.COM  ", "kurmayteknoloji.com");
checkNorm("www.alt.kurmayteknoloji.com", "alt.kurmayteknoloji.com");
checkNorm("www.com", "www.com"); // asiri soyma yok
checkNorm("www", "www");
checkNorm("", null);
checkNorm("   ", null);
checkNorm(null, null);
checkNorm(undefined, null);
checkNorm(12345, null); // string olmayan girdi

// ---------------------------------------------------------------------------
console.log("\n(g) INVARIANT — yazma ve okuma taraflari AYNI degeri uretmeli\n");
// Bugun'un kok nedeninin geri gelmesini engelleyen asil kontrol: DB'ye
// normalizeCustomDomain ile yazilan deger, parseHostname'in ayni host icin
// urettigi match.host ile BIREBIR AYNI olmali.
process.env.NEXT_PUBLIC_ROOT_DOMAIN = PROD;
for (const h of [
  "kurmayteknoloji.com",
  "www.kurmayteknoloji.com",
  "WWW.KurmayTeknoloji.COM",
  "alt.kurmayteknoloji.com",
  "www.alt.kurmayteknoloji.com",
]) {
  const m = parseHostname(h);
  ok(
    "invariant",
    `normalizeCustomDomain("${h}") === parseHostname("${h}").host`,
    normalizeCustomDomain(h),
    m.type === "custom_domain" ? m.host : "(custom_domain DEGIL)",
    h
  );
}

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failures.length} kaldi\n`);
process.exit(failures.length === 0 ? 0 : 1);
