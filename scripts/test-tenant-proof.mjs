/**
 * KURUM BASLIGI KANITI — src/lib/tenant-proof.ts (K7-B, 21 Eylul 2026).
 *
 * CALISTIRMA: npm run test:tenant-proof
 *
 * Neyi sinar:
 *   (a) imzala / dogrula — dogru host+slug gecer; yanlis host, yanlis slug,
 *       bos / kisaltilmis / hex olmayan / buyuk harfli kanit reddedilir
 *       (ATMADAN false); host buyuk/kucuk harf duyarsiz, slug duyarli.
 *   (b) sir degisince eski kanit reddedilir; sir yok ya da kisa → imzala
 *       reddeder, dogrula false, log satiri TEK kez.
 *   (c) 🔴 EDGE: ayni modul Next'in kendi Edge sandbox motorunda
 *       (next/dist/compiled/edge-runtime) calisiyor — middleware'in imzasi
 *       Node'daki render'da dogrulaniyor ve tersi.
 *   (d) next.config.mjs build kapisi — sir yok / kisa / NEXT_PUBLIC_ → build durur.
 *   (e) kaynak muhurleri — kanit YALNIZ istek basligina; node:crypto yok;
 *       dogrulama unstable_cache DISINDA.
 *
 * Sir: test KENDI test degerini kurar; .env.local OKUNMAZ, gercek sir
 * hicbir ciktiya yazilmaz.
 */

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

let passed = 0;
const failures = [];
function okTrue(group, name, cond, input = "") {
  if (cond === true) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}${input ? `\n          ${input}` : ""}`);
  }
}
const header = (s) => console.log(`\n=== ${s}`);

// Test degerleri — GERCEK sir degil.
const SIR_1 = "t".repeat(40) + "-test-sirri-bir";
const SIR_2 = "u".repeat(40) + "-test-sirri-iki";
process.env.TENANT_HEADER_SECRET = SIR_1;

// console.error'u say (sir-yok log'u TEK kez olmali)
const hataLog = [];
const asilHata = console.error;
console.error = (...a) => hataLog.push(a.join(" "));

const { imzala, dogrula, TENANT_SECRET_MIN_LENGTH } = await import("../src/lib/tenant-proof.ts");

const H = "kurmayteknoloji.com";
const S = "kurmay-teknoloji";

// ---------------------------------------------------------------------------
header("(a) imzala / dogrula");
// ---------------------------------------------------------------------------
const k = await imzala(H, S);
okTrue("a", "kanit 64 karakter kucuk harf hex", /^[0-9a-f]{64}$/.test(k), k.length);
okTrue("a", "ayni girdi → ayni kanit (deterministik)", k === (await imzala(H, S)));
okTrue("a", "dogru host + slug GECER", (await dogrula(H, S, k)) === true);
okTrue("a", "🔴 yanlis host reddedilir", (await dogrula("buyukdirilis.org.tr", S, k)) === false);
okTrue("a", "🔴 port farki = baska host, reddedilir", (await dogrula(`${H}:443`, S, k)) === false);
okTrue("a", "🔴 yanlis slug reddedilir", (await dogrula(H, "default", k)) === false);
okTrue("a", "🔴 bos kanit reddedilir", (await dogrula(H, S, "")) === false);
okTrue("a", "null kanit reddedilir", (await dogrula(H, S, null)) === false);
okTrue("a", "undefined kanit reddedilir", (await dogrula(H, S, undefined)) === false);
okTrue("a", "🔴 kisaltilmis kanit (63) reddedilir", (await dogrula(H, S, k.slice(0, 63))) === false);
okTrue("a", "kisaltilmis kanit (62, cift uzunluk) reddedilir", (await dogrula(H, S, k.slice(0, 62))) === false);
okTrue("a", "uzatilmis kanit (66) reddedilir", (await dogrula(H, S, `${k}00`)) === false);
let atti = false;
let hexDegil;
try {
  hexDegil = await dogrula(H, S, `zz${k.slice(2)}`);
} catch {
  atti = true;
}
okTrue("a", "🔴 hex olmayan kanit ATMADAN false", !atti && hexDegil === false);
okTrue("a", "tek karakteri degismis kanit reddedilir", (await dogrula(H, S, (k[0] === "0" ? "1" : "0") + k.slice(1))) === false);
// Buyuk/kucuk harf: middleware HEP kucuk harf hex yazar; kanonik olmayan bicim reddedilir.
okTrue("a", "buyuk harfli hex (kanonik degil) reddedilir", (await dogrula(H, S, k.toUpperCase())) === false || !/[a-f]/.test(k));
// Host DNS adi — buyuk/kucuk harf duyarsiz (iki taraf da bu modulden gecer)
okTrue("a", "host buyuk/kucuk harf duyarsiz (KurmayTeknoloji.COM)", (await dogrula("KurmayTeknoloji.COM", S, k)) === true);
// Slug buyuk/kucuk harf DUYARLI (middleware parseHostname'den kucuk harf yazar)
okTrue("a", "slug buyuk/kucuk harf DUYARLI (Kurmay-Teknoloji reddedilir)", (await dogrula(H, "Kurmay-Teknoloji", k)) === false);
// "\n" ayirici: HTTP baslik degeri satir sonu tasiyamaz → host/slug'a gomulemez
let yeniSatirReddedildi = false;
try {
  new Headers().set("x-tenant-slug", "a\nb");
} catch {
  yeniSatirReddedildi = true;
}
okTrue("a", "baslik degeri '\\n' tasiyamaz (ayirici host/slug'a gomulemez)", yeniSatirReddedildi);

// ---------------------------------------------------------------------------
header("(b) sir degisimi / sir yok");
// ---------------------------------------------------------------------------
process.env.TENANT_HEADER_SECRET = SIR_2;
okTrue("b", "🔴 sir degisince ESKI kanit reddedilir", (await dogrula(H, S, k)) === false);
const k2 = await imzala(H, S);
okTrue("b", "yeni sirla yeni kanit gecer", (await dogrula(H, S, k2)) === true && k2 !== k);

delete process.env.TENANT_HEADER_SECRET;
let imzalaReddetti = false;
try {
  await imzala(H, S);
} catch {
  imzalaReddetti = true;
}
okTrue("b", "🔴 sir yok → imzala REDDEDER", imzalaReddetti);
okTrue("b", "🔴 sir yok → dogrula false (gecerli bicimli kanitla bile)", (await dogrula(H, S, k2)) === false);
await dogrula(H, S, k2);
try { await imzala(H, S); } catch { /* beklenen */ }
const sirYokLog = hataLog.filter((s) => s.includes("TENANT_HEADER_SECRET yok"));
okTrue("b", "sir-yok log satiri TEK kez (ayirt edici metin)", sirYokLog.length === 1, `${sirYokLog.length} satir`);

process.env.TENANT_HEADER_SECRET = "k".repeat(TENANT_SECRET_MIN_LENGTH - 1);
okTrue("b", `kisa sir (${TENANT_SECRET_MIN_LENGTH - 1}) = sir yok → dogrula false`, (await dogrula(H, S, k2)) === false);
process.env.TENANT_HEADER_SECRET = SIR_1;
okTrue("b", "sir geri gelince ilk kanit yine gecer", (await dogrula(H, S, k)) === true);
console.error = asilHata;

// ---------------------------------------------------------------------------
header("(c) 🔴 Edge runtime — Next'in kendi sandbox motoru");
// ---------------------------------------------------------------------------
{
  const { EdgeRuntime } = require("next/dist/compiled/edge-runtime");
  const kaynak = stripTypeScriptTypes(read("src/lib/tenant-proof.ts"), { mode: "strip" })
    .replace(/^export\s+/gm, "");
  const rt = new EdgeRuntime();
  // Next'in middleware sandbox'i process.env'i saglar; ham motor saglamaz.
  rt.evaluate(`globalThis.process = { env: { TENANT_HEADER_SECRET: ${JSON.stringify(SIR_1)} } };`);
  rt.evaluate(`${kaynak}\nglobalThis.__imzala = imzala; globalThis.__dogrula = dogrula;`);
  okTrue("c", "Edge'de EdgeRuntime tanimli (gercek Edge sandbox'i)", rt.evaluate("typeof EdgeRuntime") === "string");
  okTrue("c", "Edge'de node:crypto YOK, crypto.subtle VAR", rt.evaluate("typeof require") === "undefined" && rt.evaluate("typeof crypto.subtle.verify") === "function");
  const edgeKanit = await rt.evaluate(`globalThis.__imzala(${JSON.stringify(H)}, ${JSON.stringify(S)})`);
  okTrue("c", "🔴 Edge imzasi = Node imzasi (ayni sir, ayni girdi)", edgeKanit === k, `${edgeKanit}`);
  okTrue("c", "🔴 Edge'de uretilen kanit Node'da DOGRULANIR (middleware → render)", (await dogrula(H, S, edgeKanit)) === true);
  okTrue("c", "Node'da uretilen kanit Edge'de dogrulanir (crypto.subtle.verify Edge'de calisir)", (await rt.evaluate(`globalThis.__dogrula(${JSON.stringify(H)}, ${JSON.stringify(S)}, ${JSON.stringify(k)})`)) === true);
  okTrue("c", "Edge'de yanlis slug reddedilir", (await rt.evaluate(`globalThis.__dogrula(${JSON.stringify(H)}, "default", ${JSON.stringify(k)})`)) === false);
  okTrue("c", "Edge'de hex olmayan kanit atmadan false", (await rt.evaluate(`globalThis.__dogrula(${JSON.stringify(H)}, ${JSON.stringify(S)}, "zz")`)) === false);
}

// ---------------------------------------------------------------------------
header("(d) next.config.mjs build kapisi");
// ---------------------------------------------------------------------------
{
  // Cocuk surece ORTAMI ACIKCA verilir: .env.local okunmaz, gercek sir sizmaz.
  const yukle = (ek) => {
    const env = { PATH: process.env.PATH, SYSTEMROOT: process.env.SYSTEMROOT, NEXT_PUBLIC_SUPABASE_URL: "https://ornekproje.supabase.co", ...ek };
    const r = spawnSync(process.execPath, ["-e", "import('./next.config.mjs').then(()=>console.log('YUKLENDI'),e=>console.log('HATA '+e.message))"], { cwd: REPO, env, encoding: "utf8" });
    return (r.stdout || "") + (r.stderr || "");
  };
  const yok = yukle({});
  okTrue("d", "🔴 sir yok → build DURUR (anlamli mesaj)", yok.includes("HATA") && yok.includes("TENANT_HEADER_SECRET tanimli degil"), yok.trim().slice(0, 160));
  const kisa = yukle({ TENANT_HEADER_SECRET: "x".repeat(31) });
  okTrue("d", "🔴 31 karakter → build DURUR", kisa.includes("HATA") && kisa.includes("karakterden kisa"), kisa.trim().slice(0, 160));
  okTrue("d", "hata mesaji sirri YAZMAZ", !kisa.includes("x".repeat(31)));
  const tamam = yukle({ TENANT_HEADER_SECRET: "y".repeat(32) });
  okTrue("d", "32 karakter → config yuklenir", tamam.includes("YUKLENDI"), tamam.trim().slice(0, 160));
  const acik = yukle({ TENANT_HEADER_SECRET: "y".repeat(32), NEXT_PUBLIC_TENANT_HEADER_SECRET: "z" });
  okTrue("d", "🔴 NEXT_PUBLIC_TENANT_HEADER_SECRET tanimli → build DURUR", acik.includes("HATA") && acik.includes("NEXT_PUBLIC_TENANT_HEADER_SECRET"), acik.trim().slice(0, 160));
  const cfg = read("next.config.mjs");
  const cfgMin = Number((cfg.match(/const TENANT_SECRET_MIN_LENGTH = (\d+);/) || [])[1]);
  okTrue("d", "alt sinir next.config = tenant-proof.ts", cfgMin === TENANT_SECRET_MIN_LENGTH, `${cfgMin} / ${TENANT_SECRET_MIN_LENGTH}`);
  okTrue("d", "poweredByHeader: false", /poweredByHeader:\s*false/.test(stripComments(cfg)));
}

// ---------------------------------------------------------------------------
header("(e) kaynak muhurleri");
// ---------------------------------------------------------------------------
{
  const tp = stripComments(read("src/lib/tenant-proof.ts"));
  okTrue("e", "tenant-proof.ts node:crypto IMPORT ETMIYOR (Edge'de yok)", !/from\s+["'](node:)?crypto["']|require\(["'](node:)?crypto["']\)/.test(tp));
  okTrue("e", "dogrulama crypto.subtle.verify ile (sabit zamanli)", tp.includes("crypto.subtle.verify("));
  okTrue("e", "importKey modul seviyesinde onbellekte (istek basina degil)", /let onbellek/.test(tp) && tp.split("importKey(").length - 1 === 1);

  const mw = stripComments(read("src/middleware.ts"));
  okTrue("e", "middleware imzala'yi lib/tenant-proof'tan aliyor", /import \{ imzala \} from "@\/lib\/tenant-proof";/.test(mw));
  // 🔴 kanit YALNIZ istek basligina: yanit basliklari istemciye gidiyor (olculdu)
  okTrue("e", "🔴 kanit yaniTA YAZILMIYOR (hicbir .headers.set/append(\"x-tenant-proof\")", !/\.headers\.(set|append)\(\s*["']x-tenant-proof["']/.test(mw));
  const slugSet = mw.split('requestHeaders.set("x-tenant-slug", tenantSlug);').length - 1;
  const proofSet = mw.split('requestHeaders.set("x-tenant-proof", await imzala(hostname, tenantSlug));').length - 1;
  okTrue("e", "🔴 slug'in istege yazildigi HER yerde kanit da yaziliyor (hostname ile)", slugSet >= 1 && proofSet === slugSet, `slug=${slugSet} kanit=${proofSet}`);
  okTrue("e", "imza atilamazsa gelen kanit SILINIYOR", mw.includes('requestHeaders.delete("x-tenant-proof");'));
  okTrue("e", "hostname = slug'in cozuldugu ham Host", /const hostname = request\.headers\.get\("host"\)/.test(mw) && /parseHostname\(hostname\)/.test(mw));
  okTrue("e", "yanittaki x-tenant-slug KORUNDU (panel yoklamasi)", mw.includes('supabaseResponse.headers.set("x-tenant-slug", tenantSlug);'));

  const gt = stripComments(read("src/lib/get-tenant.ts"));
  okTrue("e", "🔴 resolveCurrentTenant kaniti DEGERIYLE dogruluyor", /await dogrula\(host, slug, h\.get\("x-tenant-proof"\)\)/.test(gt));
  okTrue("e", "host yoksa no-header", /if \(!slug \|\| !host\) return \{ kind: "no-header" \};/.test(gt));
  okTrue("e", "🔴 get-tenant.ts unstable_cache KULLANMIYOR (dogrulama istek-ici cache()'te)", !gt.includes("unstable_cache"));
}

console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
