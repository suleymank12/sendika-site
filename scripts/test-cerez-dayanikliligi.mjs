/**
 * BOZUK CEREZ DAYANIKLILIGI — CANLI HTTP testi (20 Eylul 2026).
 *
 * CALISTIRMA (sunucu ayakta olmali — dev ya da production):
 *   npm run dev            # ayri terminalde (ya da: next start)
 *   npm run test:cerez     # = node scripts/test-cerez-dayanikliligi.mjs
 *
 * ## NEDEN VAR
 *
 * Tek bir bozuk oturum cerezi BUTUN siteyi 500'e dusuruyordu — panel degil,
 * PUBLIC ANASAYFA dahil (20 Eylul 2026 olcumu):
 *
 *     Cookie: sb-<ref>-auth-token=base64-BOZUKVERI
 *     /               -> 500
 *     /haberler       -> 500
 *     /admin/giris    -> 500     <- kendini kurtarma yolu da kapali
 *     /admin/yetkisiz -> 500
 *
 * Kullanici cerez temizlemeyi bilmiyorsa cikisi olmayan bir cikmaz. Bu test
 * o cikmazin geri gelmedigini HER COMMIT'te dogrular.
 *
 * ## ORTAM KAPISI
 *
 * Saf fonksiyon testi degil, GERCEK HTTP testi (test-backup-db.sh deseni):
 * dev sunucu ayakta degilse test KOSMAZ, "ATLANDI" der ve 0 ile biter.
 * Boylece CI'da ya da sunucusuz makinede yanlis alarm uretmez.
 *
 * Saf mantik tarafi: `npm run test:admin-access` (suzgec + karar fonksiyonu).
 *
 * ## 🔴 ISTEK KATMANI: `fetch` DEGIL, `node:http` (21 Eylul 2026)
 *
 * Node'un fetch'i (undici) `Host` basligini SESSIZCE yok sayiyor — istek
 * her zaman 127.0.0.1'e, yani APEX'e gidiyor (olculdu: ayni istek fetch ile
 * `x-tenant-slug: default`, http.get ile `kurmay-teknoloji`). Bu test eskiden
 * fetch kullaniyordu: varsayilan host apex oldugu icin sonuclari DOGRUYDU,
 * ama `TEST_HOST` ile verilen baska bir host hic sinanmiyordu ve test bunu
 * soylemiyordu. Artik:
 *   - istekler node:http ile (Host gercekten gider)
 *   - HOST KANARYASI: ortam kapisindan hemen sonra `host-yoklama.<kok>`
 *     host'uyla bir istek atilir; yanitta `x-tenant-slug: host-yoklama`
 *     gorulmezse Host iletilmiyor demektir → test ATLAMAZ, KIRILIR.
 *     (Middleware subdomain slug'ini DB'ye sormadan yaziyor — kanarya
 *     veriden bagimsiz.)
 */

import http from "node:http";
import https from "node:https";
import { existsSync, readFileSync } from "node:fs";

const TABAN = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const HOST = process.env.TEST_HOST || "lvh.me:3000";
const CEREZ_ADI = "sb-jqwmnawzehyvpwrtdvku-auth-token";

// Kanarya icin kok alan adi: env → .env.local → lvh.me
let KOK = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
const envYol = new URL("../.env.local", import.meta.url);
if (!KOK && existsSync(envYol)) KOK = (readFileSync(envYol, "utf8").match(/^NEXT_PUBLIC_ROOT_DOMAIN=(.*)$/m) || [])[1];
KOK = String(KOK || "lvh.me").trim().split(":")[0];
const PORT = new URL(TABAN).port;
const KANARYA_SLUG = "host-yoklama";
const KANARYA_HOST = `${KANARYA_SLUG}.${KOK}${PORT ? `:${PORT}` : ""}`;

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
function header(title) {
  console.log("");
  console.log(`--- ${title}`);
}

/**
 * Ham HTTP istegi — `Host` GERCEKTEN gider (bkz. dosya basi: fetch onu yutar).
 * Yonlendirme TAKIP EDILMEZ (http.request zaten etmez): 307'yi 200'e cevirip
 * testi korletmesin.
 */
function hamIstek(yol, host, ekBasliklar = {}, zamanAsimi = 30000) {
  const u = new URL(`${TABAN}${yol}`);
  const modul = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = modul.request(
      { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: "GET", headers: { Host: host, ...ekBasliklar } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res));
        res.on("error", reject);
      }
    );
    req.setTimeout(zamanAsimi, () => req.destroy(new Error("zaman asimi")));
    req.on("error", reject);
    req.end();
  });
}

async function iste(yol, cerez) {
  const res = await hamIstek(yol, HOST, cerez ? { Cookie: cerez } : {});
  const sc = res.headers["set-cookie"];
  return {
    status: res.statusCode,
    location: res.headers.location ?? null,
    setCookie: Array.isArray(sc) ? sc : sc ? [sc] : [],
  };
}

// ---------------------------------------------------------------------------
// Ortam kapisi
// ---------------------------------------------------------------------------
// NOT: dev sunucusu rotayi ILK istekte derliyor; ilk cevap saniyeler
// surebiliyor. Kapi bu yuzden comert (20 sn) ve iki denemeli — yoksa
// "sunucu ayakta degil" deyip testi sessizce atlardi (ilk yazimda oldu).
// Dev ya da production sunucusu olabilir (ikisinde de gecerli).
let ayakta = false;
for (let deneme = 1; deneme <= 2 && !ayakta; deneme++) {
  try {
    const kontrol = await hamIstek("/admin/giris", HOST, {}, 20000);
    ayakta = kontrol.statusCode < 500;
  } catch {
    ayakta = false;
  }
}

if (!ayakta) {
  console.log("");
  console.log("ORTAM UYGUN DEGIL: sunucu ayakta degil (ya da 5xx donuyor).");
  console.log(`Once baslatin:  npm run dev   ya da   next start     (beklenen adres: ${TABAN}, Host: ${HOST})`);
  console.log("Saf mantik testi icin: npm run test:admin-access");
  console.log("");
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 🔴 HOST KANARYASI — istek katmani Host'u gercekten tasiyor mu?
// ---------------------------------------------------------------------------
// Tasimiyorsa asagidaki her vaka SESSIZCE apex'i sinar; bu ATLAMA degil
// KIRILMA sebebidir (sessiz yanlis guven, sessiz atlamadan daha kotu).
header(`(0) istek katmani — Host basligi iletiliyor mu (kanarya ${KANARYA_HOST})`);
{
  let slug = null;
  try {
    slug = (await hamIstek("/haberler", KANARYA_HOST)).headers["x-tenant-slug"] ?? null;
  } catch (e) {
    slug = `HATA: ${e.message}`;
  }
  ok("kanarya", `Host '${KANARYA_HOST}' → x-tenant-slug '${KANARYA_SLUG}'`, slug, KANARYA_SLUG, KANARYA_HOST);
  if (slug !== KANARYA_SLUG) {
    console.log("");
    console.log("🔴 ISTEK KATMANI HOST BASLIGINI TASIMIYOR — TEST_HOST sinanamaz, test DURDU.");
    console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
    process.exit(1);
  }
  let hedefSlug = null;
  try {
    hedefSlug = (await hamIstek("/haberler", HOST)).headers["x-tenant-slug"] ?? null;
  } catch {
    hedefSlug = null;
  }
  console.log(`  bilgi: sinanan Host '${HOST}' → x-tenant-slug '${hedefSlug}'`);
}

const YOLLAR = ["/", "/haberler", "/admin/giris", "/admin/yetkisiz", "/admin"];

const gecerliGovde =
  "base64-" +
  Buffer.from(
    JSON.stringify({
      access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.imza",
      refresh_token: "r",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      expires_in: 3600,
      token_type: "bearer",
      user: { id: "1", email: "a@b.c" },
    })
  ).toString("base64url");

const VAKALAR = [
  { ad: "cerezsiz", cerez: "" },
  { ad: "🔴 cozulemeyen base64", cerez: `${CEREZ_ADI}=base64-BOZUKVERI` },
  { ad: "bos base64 govdesi", cerez: `${CEREZ_ADI}=base64-` },
  { ad: "duz metin", cerez: `${CEREZ_ADI}=duz-metin-cerez` },
  { ad: "duz JSON (eski bicim)", cerez: `${CEREZ_ADI}={"access_token":"x"}` },
  { ad: "bos deger", cerez: `${CEREZ_ADI}=` },
  { ad: "kirpilmis govde", cerez: `${CEREZ_ADI}=${gecerliGovde.slice(0, 40)}` },
  { ad: "parca kalintisi (.0/.1)", cerez: `${CEREZ_ADI}.0=base64-eyJhY2Nlc3; ${CEREZ_ADI}.1=BOZUK` },
  { ad: "🔴 ayni ad iki kez (gecerli sonra copluk)", cerez: `${CEREZ_ADI}=${gecerliGovde}; ${CEREZ_ADI}=base64-BOZUK` },
  { ad: "🔴 ayni ad iki kez (copluk sonra gecerli)", cerez: `${CEREZ_ADI}=base64-BOZUK; ${CEREZ_ADI}=${gecerliGovde}` },
  { ad: "cok uzun copluk", cerez: `${CEREZ_ADI}=base64-${"Z".repeat(3000)}` },
];

// ---------------------------------------------------------------------------
header("HICBIR ROTA 5xx VERMEMELI");
// ---------------------------------------------------------------------------
for (const vaka of VAKALAR) {
  for (const yol of YOLLAR) {
    const { status } = await iste(yol, vaka.cerez);
    ok("5xx", `${vaka.ad} @ ${yol}`, status < 500, true, `HTTP ${status}`);
  }
}

// ---------------------------------------------------------------------------
header("KENDINI ONARMA — bozuk cerez tarayicidan DUSURULUYOR");
// ---------------------------------------------------------------------------
{
  const { setCookie } = await iste("/admin/giris", `${CEREZ_ADI}=base64-BOZUKVERI`);
  const dusuruldu = setCookie.some(
    (c) => c.startsWith(`${CEREZ_ADI}=`) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c)
  );
  ok("onarim", "🔴 bozuk cerez Max-Age=0 ile siliniyor", dusuruldu, true, setCookie.join(" | ") || "(Set-Cookie yok)");
}

// ---------------------------------------------------------------------------
header("SAGLAM CEREZ KORUNUYOR (yanlislikla silme yok)");
// ---------------------------------------------------------------------------
{
  // Govde saglam ama imza gecersiz: Supabase "gecersiz oturum" der.
  // Beklenti: istek 5xx OLMAZ ve giris sayfasi acilir.
  const { status } = await iste("/admin/giris", `${CEREZ_ADI}=${gecerliGovde}`);
  ok("koruma", "saglam bicimli cerezle giris sayfasi acilir", status < 500, true, `HTTP ${status}`);

  // Auth DISI cerezler her durumda dokunulmadan gecmeli.
  const { status: s2 } = await iste("/", "dil=tr; analitik=1");
  ok("koruma", "auth disi cerezler sorunsuz", s2 < 500, true, `HTTP ${s2}`);
}

// ---------------------------------------------------------------------------
header("(C6a) YONLENDIRMEDE KUTUPHANE CEREZLERI — yenilenen jeton ve 4xx silmesi tarayiciya ulasir");
// ---------------------------------------------------------------------------
// 25 Eylul 2026: middleware yonlendirme/503 yaniti ayri bir nesne; kutuphane
// (setAll) cerezleri eskiden yalniz `supabaseResponse`'a yaziliyordu →
// yonlendirmede yenilenen jeton KAYBOLUYORDU (olculdu, arıza enjektoruyle:
// raporlar/2026-09-25-…-kesinti-tur2). Canli sunucu gercek Supabase'e gittigi
// icin basarili yenileme burada uretilemez (gercek oturum gerekir); o yarim
// test:kesinti'de (vekilin yerel sahte yenilemesi) davranis olarak, burada
// KAYNAK muhru olarak durur. 4xx silmesi burada canli sinanir.
{
  const { status, location, setCookie } = await iste("/admin", `${CEREZ_ADI}=${gecerliGovde}`);
  ok("c6a", "canli: /admin + imzasi gecersiz (suresi dolmamis) cerez → 307 /admin/giris", [status, (location || "").replace(/^https?:\/\/[^/]+/, "").split("?")[0]], [307, "/admin/giris"], `HTTP ${status} ${location}`);
  const silindi = setCookie.some((c) => c.startsWith(`${CEREZ_ADI}=`) && /Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(c));
  ok("c6a", "canli: 🔴 ayni YONLENDIRME yanitinda auth cerezi Max-Age=0 ile siliniyor", silindi, true, setCookie.join(" | ") || "(Set-Cookie yok)");

  const MW = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");
  const yorumsuz = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  /** Kaynak kurallari (metin uzerinde; oz-sinama ayni fonksiyonu mutasyonla cagirir). */
  const kaynakKurallari = (metin) => {
    const kod = yorumsuz(metin);
    const bas = kod.indexOf("const yanit =");
    const son = kod.indexOf("export const config");
    const govde = bas >= 0 && son > bas ? kod.slice(bas, son) : "";
    const ciplak = govde.split("\n").map((l) => l.trim())
      .filter((l) => /^return\b/.test(l) && !/^return yanit\(/.test(l) && l !== "return res;" && l !== "return kept;");
    const yanitGovdesi = govde.slice(0, govde.indexOf("};") + 2);
    const setAll = kod.slice(kod.indexOf("setAll("), kod.indexOf("setAll(") + 1200);
    return {
      tumReturnlerYanittan: govde !== "" && ciplak.length === 0,
      ciplak,
      kutuphaneTasiniyor:
        /kutuphaneCerezleri\.set\(name, \{ value, options \}\)/.test(setAll) &&
        /kutuphaneCerezleri\.forEach\(\(\{ value, options \}, name\) => \{\s*res\.cookies\.set\(name, value, options\);/.test(yanitGovdesi),
    };
  };
  const g = kaynakKurallari(MW);
  ok("c6a", "kaynak: 'const yanit =' sonrasi HER return yanit(...) ile (redirect/503 dahil)", g.tumReturnlerYanittan, true, g.ciplak.join(" | ") || "(ciplak return yok)");
  ok("c6a", "kaynak: setAll kutuphane cerezlerini kaydediyor, yanit() her yanita yaziyor", g.kutuphaneTasiniyor, true, "middleware.ts setAll / yanit");

  // Oz-sinama (bellekte): kurallar kendi hatasini yakaliyor mu?
  const m1 = MW.replace(/    kutuphaneCerezleri\.forEach\(\(\{ value, options \}, name\) => \{\n      res\.cookies\.set\(name, value, options\);\n    \}\);\n/, "");
  ok("c6a", "oz-sinama: yanit()'ten kutuphane cerezi dongusu silinirse kural DUSER", m1 !== MW && kaynakKurallari(m1).kutuphaneTasiniyor, false, "mutasyon M1");
  const m2 = MW.replace("return yanit(NextResponse.redirect(loginUrl));", "return NextResponse.redirect(loginUrl);");
  ok("c6a", "oz-sinama: ciplak 'return NextResponse.redirect' eklenirse kural DUSER", m2 !== MW && kaynakKurallari(m2).tumReturnlerYanittan, false, "mutasyon M2");
}

// ---------------------------------------------------------------------------
header("(C6) PUBLIC YOLDA AUTH YOK — cerez okunmaz, yenilenmez, silinmez");
// ---------------------------------------------------------------------------
// 25 Eylul 2026: getUser yalniz /admin* ve /super-admin* yollarinda (toplam
// butce 4 sn). Public yolda bozuk ya da gecersiz cerez artik SILINMEZ —
// hic okunmuyor; panel yolunda (onarim bolumu) silme aynen suruyor.
{
  const cerezYok = async (yol, cerez) => {
    const { status, setCookie } = await iste(yol, cerez);
    return { status, auth: setCookie.filter((c) => c.startsWith(CEREZ_ADI)) };
  };
  const a = await cerezYok("/", `${CEREZ_ADI}=base64-BOZUKVERI`);
  ok("c6", "public '/' + cozulemeyen cerez → Set-Cookie YOK (cerez okunmadi)", a.auth, [], `HTTP ${a.status}`);
  const b = await cerezYok("/haberler", `${CEREZ_ADI}=base64-BOZUKVERI`);
  ok("c6", "public '/haberler' + cozulemeyen cerez → Set-Cookie YOK", b.auth, [], `HTTP ${b.status}`);
  const c = await cerezYok("/", `${CEREZ_ADI}=${gecerliGovde}`);
  ok("c6", "public '/' + imzasi gecersiz cerez → Set-Cookie YOK (getUser cagrilmadi)", c.auth, [], `HTTP ${c.status}`);

  const kod = readFileSync(new URL("../src/middleware.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const dal = kod.indexOf("if (panelYolu) {");
  const cagrilar = [...kod.matchAll(/oturumluIstemci\(\)/g)].map((m) => m.index);
  ok("c6", "kaynak: oturumlu istemci YALNIZ 'if (panelYolu)' dalinda kuruluyor",
    dal > 0 && cagrilar.length === 1 && cagrilar[0] > dal && /const panelYolu = PANEL_ONEKLERI\.some\(/.test(kod), true, `dal ${dal}, cagrilar ${cagrilar}`);
  ok("c6", "kaynak: getUser Promise.race ile toplam butceli (AUTH_TOPLAM_BUTCE_MS)",
    /Promise\.race\(\[\s*getUserIstegi,/.test(kod) && /setTimeout\(\(\) => coz\("sure-doldu"\), AUTH_TOPLAM_BUTCE_MS\)/.test(kod) && /const AUTH_TOPLAM_BUTCE_MS = SUPABASE_BUTCE_MS\.middleware;/.test(kod), true, "middleware.ts");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
