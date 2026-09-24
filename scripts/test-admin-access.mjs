/**
 * Panel erisim karari + bozuk cerez suzgeci testi (20 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:admin-access
 *   (= node scripts/test-admin-access.mjs)
 *
 * ## BUG NEYDI (regresyon kaydi)
 *
 * (1) `admin/(authenticated)/layout.tsx` iki AYRI durumu ayni ekrana
 *     cikariyordu:
 *
 *       if (memberError) redirect("/admin/yetkisiz");   // gecici DB hatasi
 *       if (!membership) redirect("/admin/yetkisiz");   // gercek yetkisizlik
 *
 *     Supabase bir anligina hata dondugunde kullaniciya "bu kurumda
 *     yetkiniz yok" deniyordu; tek cikis "Cikis Yap"ti.
 *
 * (2) Tek bir bozuk oturum cerezi BUTUN siteyi 500'e dusuruyordu
 *     (public anasayfa dahil) — `@supabase/ssr` cerezi cozerken
 *     "Invalid UTF-8 sequence" firlatiyor, middleware her rotada
 *     calisiyor. Kullanici cerez temizlemeyi bilmiyorsa cikmaz.
 *
 * ## BU TEST NEYI DOGRULAR
 *
 *   (a) decideAdminAccess — ALTI dal, sira dahil
 *   (b) 🔴 hata dalinin `!membership` dalindan ONCE gelmesi (asil bug)
 *   (c) fail-closed — hicbir hata dalinda "izin" cikmaz
 *   (d) cerez suzgeci — cozumlenemeyen auth cerezi elenir, digerlerine
 *       DOKUNULMAZ
 *   (e) 🔴 iki hata sinifinin ayrimi (isTransportAuthError): tasima
 *       hatasinda cerez KORUNUR, cozumleme hatasinda SILINIR
 *   (f) middleware kaynagi — suzgec, iki katman ve cerez dusurme yerinde
 *   (g) layout + yetkisiz sayfasi — saf karar kullaniliyor, e-posta
 *       gosteriliyor, panel adresi ANILMIYOR
 *
 * ⚠️ KAPSAM SINIRI: React/HTTP kosucusu yok; (f) ve (g) KAYNAK METNI
 *   uzerinde varlik/sira kontrolu yapar. Calisan davranis icin:
 *   `npm run test:cerez-dayanikliligi` (dev sunucu ayakken).
 */

import { readdirSync, readFileSync } from "node:fs";
import { decideAdminAccess, decideOturum, decideSuperAdminAccess } from "../src/lib/admin-access.ts";
import {
  isAuthCookieName,
  isDecodableAuthCookieValue,
  isTransportAuthError,
  sanitizeAuthCookies,
} from "../src/lib/supabase/cookie-sanitize.ts";

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
function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}
function header(title) {
  console.log("");
  console.log(`--- ${title}`);
}
function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}
function comesBefore(src, a, b) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
}

const USER = { id: "u1" };
const TENANT = { id: "t1", is_active: true };
const MEMBERSHIP = { id: "m1" };
const karar = (o) =>
  decideAdminAccess({ user: null, tenant: null, membership: null, membershipError: null, ...o });

// ---------------------------------------------------------------------------
header("(a)(b)(c) decideAdminAccess — alti dal, sira ve fail-closed");
// ---------------------------------------------------------------------------
{
  ok("karar", "oturum yok -> giris", karar({}).kind, "giris", "user=null");
  ok("karar", "kurum yok -> kurum-yok", karar({ user: USER }).kind, "kurum-yok", "tenant=null");
  ok(
    "karar",
    "kurum pasif -> kurum-pasif",
    karar({ user: USER, tenant: { id: "t1", is_active: false }, membership: MEMBERSHIP }).kind,
    "kurum-pasif",
    "is_active=false"
  );
  ok(
    "karar",
    "uyelik yok -> yetkisiz",
    karar({ user: USER, tenant: TENANT }).kind,
    "yetkisiz",
    "membership=null"
  );
  ok(
    "karar",
    "her sey yolunda -> izin",
    karar({ user: USER, tenant: TENANT, membership: MEMBERSHIP }).kind,
    "izin",
    "tam girdi"
  );

  // 🔴 ASIL BUG: sorgu hatasinda `membership` zaten null gelir. Hata
  //    kontrolu `!membership`ten ONCE olmazsa kullaniciya "yetkin yok"
  //    denir. Bu iki satir duzeltmenin ta kendisi.
  ok(
    "karar",
    "🔴 sorgu hatasi -> gecici-hata (yetkisiz DEGIL)",
    karar({ user: USER, tenant: TENANT, membership: null, membershipError: { message: "boom" } }).kind,
    "gecici-hata",
    "membershipError var, membership null"
  );
  ok(
    "karar",
    "hata + uyelik birlikte gelse bile hata kazanir",
    karar({ user: USER, tenant: TENANT, membership: MEMBERSHIP, membershipError: { message: "x" } }).kind,
    "gecici-hata",
    "ikisi birden"
  );

  // Fail-closed: hicbir hata/eksik girdi dalinda "izin" cikmamali.
  const izinsizOlmasiGerekenler = [
    karar({}),
    karar({ user: USER }),
    karar({ user: USER, tenant: { id: "t1", is_active: false } }),
    karar({ user: USER, tenant: TENANT }),
    karar({ user: USER, tenant: TENANT, membershipError: { message: "x" } }),
    karar({ user: null, tenant: TENANT, membership: MEMBERSHIP }),
  ];
  okTrue(
    "karar",
    "🔴 fail-closed: eksik/hatali girdide ASLA izin yok",
    izinsizOlmasiGerekenler.every((d) => d.kind !== "izin"),
    izinsizOlmasiGerekenler.map((d) => d.kind).join(",")
  );
  ok(
    "karar",
    "oturum yoksa kurum/uyelik bakilmaz",
    karar({ user: null, tenant: TENANT, membership: MEMBERSHIP, membershipError: { message: "x" } }).kind,
    "giris",
    "user=null oncelikli"
  );
}

// ---------------------------------------------------------------------------
header("(d) Cerez suzgeci — cozumlenemeyen auth cerezi elenir");
// ---------------------------------------------------------------------------
{
  ok("suzgec", "auth cerezi adi taniniyor", isAuthCookieName("sb-abc-auth-token"), true, "sb-abc-auth-token");
  ok("suzgec", "parcali ad taniniyor", isAuthCookieName("sb-abc-auth-token.1"), true, ".1");
  ok("suzgec", "baska cerez auth degil", isAuthCookieName("dil-tercihi"), false, "dil-tercihi");
  ok("suzgec", "benzer ama farkli ad", isAuthCookieName("sb-abc-refresh"), false, "sb-abc-refresh");

  const gecerli = "base64-" + Buffer.from(JSON.stringify({ user: { id: "1" } })).toString("base64url");
  ok("suzgec", "gecerli base64 govde", isDecodableAuthCookieValue(gecerli), true, "gecerli");
  ok("suzgec", "🔴 cozulemeyen base64", isDecodableAuthCookieValue("base64-BOZUKVERI"), false, "BOZUKVERI");
  ok("suzgec", "bos base64 govdesi", isDecodableAuthCookieValue("base64-"), false, "base64-");
  // Onaeksiz degerler kutuphanede zaten sessizce "oturum yok"a cevriliyor;
  // elemek gereksiz yere oturum dusurmek olurdu (olculdu).
  ok("suzgec", "oneksiz deger elenmez", isDecodableAuthCookieValue("duz-metin"), true, "duz-metin");
  // Y1 (24 Eylul 2026): middleware'in sildigi cerez Node tarafinda value: undefined
  // geliyordu → undefined.startsWith TypeError → o istekteki anon sorgular gitmiyordu.
  ok("suzgec", "🔴 Y1: undefined deger cozumlenemez (firlatmaz)", isDecodableAuthCookieValue(undefined), false, "undefined");
  ok("suzgec", "Y1: null deger cozumlenemez", isDecodableAuthCookieValue(null), false, "null");
  {
    let sonucY1, hataY1 = null;
    try { sonucY1 = sanitizeAuthCookies([{ name: "sb-abc-auth-token", value: undefined }, { name: "dil", value: "tr" }]); } catch (e) { hataY1 = e; }
    ok("suzgec", "Y1: undefined degerli auth cerezi elenir, digeri korunur", hataY1 ? String(hataY1) : [sonucY1.droppedNames, sonucY1.kept.map((c) => c.name)], [["sb-abc-auth-token"], ["dil"]], "silinmis cerez");
  }

  const sonuc = sanitizeAuthCookies([
    { name: "dil-tercihi", value: "tr" },
    { name: "sb-abc-auth-token", value: "base64-BOZUKVERI" },
    { name: "sb-xyz-auth-token", value: gecerli },
  ]);
  ok("suzgec", "bozuk olan elendi", sonuc.droppedNames, ["sb-abc-auth-token"], "3 cerez");
  ok("suzgec", "digerleri korundu", sonuc.kept.map((c) => c.name), ["dil-tercihi", "sb-xyz-auth-token"], "3 cerez");
  ok("suzgec", "auth disi cereze DOKUNULMAZ", sanitizeAuthCookies([{ name: "x", value: "base64-BOZUK" }]).droppedNames, [], "auth degil");
  ok("suzgec", "temiz girdide eleme yok", sanitizeAuthCookies([{ name: "sb-a-auth-token", value: gecerli }]).droppedNames, [], "temiz");
}

// ---------------------------------------------------------------------------
header("(e) 🔴 IKI HATA SINIFI — tasima mi, cozumleme mi?");
// ---------------------------------------------------------------------------
{
  // Olculen imzalar (20 Eylul 2026, gercek kutuphane + sahte fetch):
  //   ag yok  -> AuthRetryableFetchError status 0
  //   503     -> AuthRetryableFetchError status 503
  //   bozuk   -> AuthSessionMissingError  status 400
  okTrue("sinif", "ag yok -> TASIMA (cerez korunur)", isTransportAuthError({ name: "AuthRetryableFetchError", status: 0 }), "status 0");
  okTrue("sinif", "503 -> TASIMA", isTransportAuthError({ name: "AuthRetryableFetchError", status: 503 }), "status 503");
  okTrue("sinif", "500 -> TASIMA", isTransportAuthError({ name: "AuthApiError", status: 500 }), "status 500");
  ok("sinif", "🔴 400 oturum yok -> COZUMLEME (cerez silinir)", isTransportAuthError({ name: "AuthSessionMissingError", status: 400 }), false, "status 400");
  ok("sinif", "401 -> COZUMLEME", isTransportAuthError({ name: "AuthApiError", status: 401 }), false, "status 401");
  ok("sinif", "hata yoksa tasima da yok", isTransportAuthError(null), false, "null");
  // Taninmayan hata: supheye dusuldugunde SILME (yanlis silme butun
  // adminleri dusurur; yanlis saklama yalniz bir istek ertelenir).
  okTrue("sinif", "taninmayan hata -> suphede SILME", isTransportAuthError({ message: "?" }), "ad/status yok");
  okTrue("sinif", "ad tasima ama status 400 ise ad kazanir", isTransportAuthError({ name: "AuthRetryableFetchError", status: 400 }), "ad oncelikli");
}

// ---------------------------------------------------------------------------
header("(f) middleware — suzgec, iki katman, cerez dusurme");
// ---------------------------------------------------------------------------
{
  const mw = read("src/middleware.ts");
  const kod = stripComments(mw);

  okTrue("mw", "suzgec getAll icinde", kod.includes("sanitizeAuthCookies(request.cookies.getAll())"), "middleware");
  okTrue("mw", "elenen adlar toplaniyor", kod.includes("bozukCerezAdlari"), "middleware");
  okTrue("mw", "getUser try/catch icinde", comesBefore(kod, "try {", "await supabase.auth.getUser()"), "middleware");
  okTrue("mw", "🔴 tasima/cozumleme ayrimi yapiliyor", kod.includes("isTransportAuthError(error)"), "middleware");
  okTrue("mw", "cerez Max-Age=0 ile dusuruluyor", kod.includes('res.cookies.set(name, "", { path: "/", maxAge: 0 })'), "middleware");
  okTrue("mw", "beklenmeyen hata LOGLANIYOR (yutulmuyor)", kod.includes('console.error("[Middleware] auth.getUser() beklenmeyen hata:", err)'), "middleware");
  okTrue("mw", "tasima hatasi da loglaniyor", kod.includes("Supabase auth erisilemedi"), "middleware");

  // Istemci kurulduktan SONRAKI her return yanit()'tan gecmeli; yoksa o
  // yoldan donen yanit bozuk cerezi dusurmez ve kullanici dongude kalir.
  const istemciIdx = kod.indexOf("createServerClient(");
  const sonra = kod.slice(istemciIdx);
  const ciplakReturn = sonra
    .split("\n")
    .filter((l) => /return (NextResponse|supabaseResponse)/.test(l))
    .map((l) => l.trim());
  ok("mw", "🔴 istemciden sonra ciplak return YOK", ciplakReturn, [], "hepsi yanit() ile sarili olmali");
  okTrue("mw", "yanit() sarmalayicisi kullaniliyor", (kod.match(/return yanit\(/g) || []).length >= 5, "en az 5 return");

  const srv = stripComments(read("src/lib/supabase/server.ts"));
  okTrue("srv", "sunucu istemcisi de suzuyor (/api dahil)", srv.includes("sanitizeAuthCookies(cookieStore.getAll()).kept"), "server.ts");
}

// ---------------------------------------------------------------------------
header("(g) layout + yetkisiz sayfasi");
// ---------------------------------------------------------------------------
{
  const layout = stripComments(read("src/app/admin/(authenticated)/layout.tsx"));
  okTrue("layout", "saf karar kullaniliyor", layout.includes("decideAdminAccess({"), "layout");
  okTrue("layout", "gecici hata ekrani render ediliyor", layout.includes("<AdminGeciciHataView />"), "layout");
  okTrue("layout", "yetkisiz yonlendirmesi duruyor", layout.includes('redirect("/admin/yetkisiz")'), "layout");
  okTrue(
    "layout",
    "🔴 gecici hatada panel ACILMIYOR (return ile kesiliyor)",
    comesBefore(layout, "return <AdminGeciciHataView />;", "<AdminShell"),
    "fail-closed"
  );
  okTrue("layout", "eski cift redirect kalmadi", !layout.includes("if (memberError) {"), "layout");

  const yetkisiz = read("src/app/admin/yetkisiz/page.tsx");
  const yetkisizKod = stripComments(yetkisiz);
  okTrue("yetkisiz", "e-posta okunuyor", yetkisizKod.includes("setEmail(user?.email ?? null)"), "yetkisiz");
  okTrue("yetkisiz", "e-posta ekranda gosteriliyor", yetkisizKod.includes("{email}"), "yetkisiz");
  okTrue("yetkisiz", "super admin dali var", yetkisizKod.includes("is_super_admin"), "yetkisiz");
  okTrue("yetkisiz", "cikis butonu cerezi temizliyor", yetkisizKod.includes("supabase.auth.signOut()"), "yetkisiz");
  okTrue("yetkisiz", "cikis sonrasi TAM yenileme", yetkisizKod.includes('window.location.href = "/admin/giris"'), "yetkisiz");
  // 🔴 19 Eylul obskurite karari: panel adresi kurum host'unda ANILMAZ.
  okTrue("yetkisiz", "🔴 super admin panel adresi ANILMIYOR", !yetkisiz.includes("superadminpanel"), "yetkisiz");
  okTrue("yetkisiz", "🔴 /super-admin yolu da ANILMIYOR", !yetkisizKod.includes("/super-admin"), "yetkisiz");
}

// ---------------------------------------------------------------------------
header("(h) C8 — gecici hata ≠ yetkisiz / giris (24 Eylul 2026)");
// ---------------------------------------------------------------------------
{
  const U = { id: "u1" };
  const T = isTransportAuthError;
  // decideOturum — tasima hatasi GIRIS SAYILMAZ, oturum da SAYILMAZ
  ok("oturum", "kullanici var, hata yok → var", decideOturum({ user: U, authError: null }, T), "var", "u+0");
  ok("oturum", "kullanici yok, hata yok → giris", decideOturum({ user: null, authError: null }, T), "giris", "0+0");
  ok("oturum", "🔴 ag yok (status 0) → gecici-hata (giris DEGIL)", decideOturum({ user: null, authError: { name: "AuthRetryableFetchError", status: 0 } }, T), "gecici-hata", "status 0");
  ok("oturum", "AuthRetryableFetchError adi yeterli", decideOturum({ user: null, authError: { name: "AuthRetryableFetchError" } }, T), "gecici-hata", "ad");
  ok("oturum", "503 → gecici-hata", decideOturum({ user: null, authError: { name: "AuthApiError", status: 503 } }, T), "gecici-hata", "503");
  ok("oturum", "4xx (oturum kullanilamaz) → giris", decideOturum({ user: null, authError: { name: "AuthSessionMissingError", status: 400 } }, T), "giris", "400");
  ok("oturum", "taninmayan hata → gecici-hata (supheli durumda panel KAPALI, cikis yok)", decideOturum({ user: null, authError: {} }, T), "gecici-hata", "{}");
  // decideSuperAdminAccess — rpc HATASI yetkisizlik degil; gercek yetkisizlik AYNEN
  const sa = (x) => decideSuperAdminAccess({ user: U, authError: null, isSuperAdmin: null, rpcError: null, ...x }, T).kind;
  ok("super-admin", "oturum yok → giris", sa({ user: null }), "giris", "0");
  ok("super-admin", "🔴 oturum tasima hatasi → gecici-hata", sa({ user: null, authError: { status: 0 } }), "gecici-hata", "tasima");
  ok("super-admin", "🔴 rpc HATASI → gecici-hata (Yetkisiz DEGIL)", sa({ rpcError: { message: "fetch failed" } }), "gecici-hata", "rpc hata");
  ok("super-admin", "rpc false → yetkisiz (AYNEN)", sa({ isSuperAdmin: false }), "yetkisiz", "false");
  ok("super-admin", "rpc bos (null, hatasiz) → yetkisiz", sa({ isSuperAdmin: null }), "yetkisiz", "null");
  ok("super-admin", "rpc true → izin", sa({ isSuperAdmin: true }), "izin", "true");
  ok("super-admin", "rpc hatasi + true birlikte → gecici-hata (hata once)", sa({ isSuperAdmin: true, rpcError: { message: "x" } }), "gecici-hata", "hata+true");

  // Kaynak muhurleri
  const adminL = stripComments(read("src/app/admin/(authenticated)/layout.tsx"));
  okTrue("kaynak", "admin layout: decideOturum → gecici ekran; tasima hatasinda girise yonlendirme YOK",
    adminL.includes("decideOturum({ user, authError }, isTransportAuthError)") &&
      comesBefore(adminL, "return <AdminGeciciHataView />;", 'redirect("/admin/giris")') &&
      !/if \(authError\) \{\s*console\.error\([^)]*\);\s*redirect\("\/admin\/giris"\)/.test(adminL),
    "admin layout");
  const saL = stripComments(read("src/app/super-admin/(authenticated)/layout.tsx"));
  okTrue("kaynak", "super admin layout: decideSuperAdminAccess + gecici ekran, Yetkisiz yalniz izin disi",
    saL.includes("decideSuperAdminAccess(") && saL.includes("<SuperAdminGeciciHataView />") && saL.includes('karar.kind !== "izin"'),
    "super admin layout");
  const apiDizin = "src/app/api/super-admin";
  const rotalar = [];
  const gez = (d) => { for (const a of readdirSync(new URL(`../${d}`, import.meta.url), { withFileTypes: true })) { const g = `${d}/${a.name}`; if (a.isDirectory()) gez(g); else if (a.name === "route.ts") rotalar.push(g); } };
  gez(apiDizin);
  const yerel = rotalar.filter((r) => /async function requireSuperAdmin\b|\.rpc\("is_super_admin"/.test(stripComments(read(r))));
  const paylasilan = rotalar.filter((r) => read(r).includes('from "@/lib/super-admin/require-super-admin"'));
  okTrue("kaynak", `yerel requireSuperAdmin / dogrudan is_super_admin rpc'si 0 (${rotalar.length} route tarandi; paylasilan modulu kullanan ${paylasilan.length})`,
    yerel.length === 0 && paylasilan.length >= 7, yerel.join(", ") || "temiz");
  const rsa = stripComments(read("src/lib/super-admin/require-super-admin.ts"));
  okTrue("kaynak", "paylasilan kapi: gecici-hata → 503 + Retry-After, yetkisiz → 403, giris → 401",
    /case "gecici-hata":[\s\S]*status: 503[\s\S]*"retry-after": "30"/.test(rsa) && /case "yetkisiz":[\s\S]*status: 403/.test(rsa) && /case "giris":[\s\S]*status: 401/.test(rsa),
    "require-super-admin");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
