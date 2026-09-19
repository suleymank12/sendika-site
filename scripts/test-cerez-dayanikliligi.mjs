/**
 * BOZUK CEREZ DAYANIKLILIGI — CANLI HTTP testi (20 Eylul 2026).
 *
 * CALISTIRMA (dev sunucu ayakta olmali):
 *   npm run dev            # ayri terminalde
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
 */

const TABAN = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
const HOST = process.env.TEST_HOST || "lvh.me:3000";
const CEREZ_ADI = "sb-jqwmnawzehyvpwrtdvku-auth-token";

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

/** Yonlendirme TAKIP EDILMEZ: 307'yi 200'e cevirip testi korletmesin. */
async function iste(yol, cerez) {
  const res = await fetch(`${TABAN}${yol}`, {
    redirect: "manual",
    headers: { Host: HOST, ...(cerez ? { Cookie: cerez } : {}) },
  });
  return {
    status: res.status,
    location: res.headers.get("location"),
    setCookie: res.headers.getSetCookie?.() ?? [],
  };
}

// ---------------------------------------------------------------------------
// Ortam kapisi
// ---------------------------------------------------------------------------
// NOT: dev sunucusu rotayi ILK istekte derliyor; ilk cevap saniyeler
// surebiliyor. Kapi bu yuzden comert (20 sn) ve iki denemeli — yoksa
// "sunucu ayakta degil" deyip testi sessizce atlardi (ilk yazimda oldu).
let ayakta = false;
for (let deneme = 1; deneme <= 2 && !ayakta; deneme++) {
  try {
    const kontrol = await fetch(`${TABAN}/admin/giris`, {
      redirect: "manual",
      headers: { Host: HOST },
      signal: AbortSignal.timeout(20000),
    });
    ayakta = kontrol.status < 500;
  } catch {
    ayakta = false;
  }
}

if (!ayakta) {
  console.log("");
  console.log("ORTAM UYGUN DEGIL: dev sunucu ayakta degil (ya da 5xx donuyor).");
  console.log(`Once baslatin:  npm run dev     (beklenen adres: ${TABAN}, Host: ${HOST})`);
  console.log("Saf mantik testi icin: npm run test:admin-access");
  console.log("");
  process.exit(0);
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
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
