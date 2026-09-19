/**
 * Mail linki akisi testi — sifre sifirlama PKCE'den cikariliyor (P1).
 * (20 Eylul 2026, bkz. raporlar/2026-09-20-0004-...-tasarimi.md)
 *
 * CALISTIRMA:
 *   npm run test:auth-link
 *   (= node scripts/test-auth-link.mjs)
 *
 * ## BUG NEYDI (regresyon kaydi)
 *
 * "Sifremi unuttum" linki BASKA bir tarayicida/cihazda acilinca "gecersiz"
 * diyordu. Supabase auth loglari (19 Eylul 2026, UTC):
 *
 *     17:18:45  /recover  200  user_recovery_requested   (TEK istek)
 *     17:18:58  /verify   303  auth_event: action=login  ← BASARILI
 *     17:19:04  /verify   403  "One-time token not found"
 *     17:19:26  /verify   403  "One-time token not found"
 *
 * Link ilk kullanimda CALISTI; gorulen hata ikinci/ucuncu denemeydi. Ilk
 * denemede sifre formunun gelmemesinin sebebi PKCE'ydi: `code_verifier`
 * istegin yapildigi tarayicida kalir (gizli pencerede istendi, normal
 * pencerede tiklandi). Davet ayni sorunu yasamiyordu cunku o SUNUCUDAN
 * baslar ve implicit akis kullanir.
 *
 * ## BU TEST NEYI DOGRULAR
 *
 *   (a) parseAuthLink — dort giris yolu ve ARALARINDAKI ONCELIK
 *   (b) 🔴 R2 / cifte soru isareti — AUTH_LINK_JOINER sozlesmesi.
 *       Sabit yanlis degere cevrilirse token_hash SESSIZCE kaybolur;
 *       buradaki vaka bunu commit aninda yakalar
 *   (c) buildRecoveryReturnUrl — donus adresi SORGU TASIMAZ
 *   (d) buildInviteRedirectUrl — donus adresi TAM BIR query tasir
 *   (e) 🔴 R1 / StrictMode — kabul sayfasindaki UC onlem (tek cagri
 *       kilidi, replaceState, dogru istemci) KAYNAKTAN dogrulanir;
 *       onlemlerden biri silinirse test KIRILIR
 *   (f) Sifirlama formu PKCE'siz istemciyi kullanir, dogrudan
 *       `lib/supabase/client` KULLANMAZ
 *   (g) auth-mail-client — implicit + depolamasiz
 *   (h) Donus yolu sabiti uc dosyada AYNI (admin-invite / setup-checklist
 *       / setup-probes)
 *   (i) Gecis donemi — eski `?code` ve davet `#access_token` dallari
 *       kabul sayfasinda DURUYOR (P3'e kadar silinmeyecek)
 *   (j) Super admin panel host'u — kok yol yonlendirmesi (20 Eylul 2026);
 *       yalniz `/`, digerleri 404 kalir
 *
 * ⚠️ KAPSAM SINIRI (bilincli): repoda React/HTTP kosucusu YOK. Kabul
 *   sayfasinin calisan davranisi burada calistirilmaz; (e) ve (i)
 *   maddeleri KAYNAK METNI uzerinde sira ve varlik kontrolu yapar.
 *   Gercek uctan uca dogrulama NOTE.md'deki manuel test tablosunda
 *   (telefondan iste → bilgisayardan tikla, ve tersi).
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir.
 */

import { readFileSync } from "node:fs";
import { createBrowserClient } from "@supabase/ssr";
import { createAuthMailClient } from "../src/lib/supabase/auth-mail-client.ts";
import {
  AUTH_LINK_JOINER,
  AUTH_RETURN_PATH,
  buildInviteRedirectUrl,
  buildRecoveryReturnUrl,
  buildTemplateAuthLink,
  parseAuthLink,
} from "../src/lib/super-admin/admin-invite.ts";
import { AUTH_RETURN_PATH as CHECKLIST_RETURN_PATH } from "../src/lib/super-admin/setup-checklist.ts";
import { SUPABASE_RETURN_PATH } from "../src/lib/super-admin/setup-probes.ts";
import { SUPER_ADMIN_HOME_PATH } from "../src/lib/constants.ts";

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

/** Yorumlari atar — "kodda gecmiyor" iddialari yorum metnine takilmasin. */
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

const KABUL_SAYFASI = "src/app/admin/davet-kabul/page.tsx";
const SIFIRLAMA_FORMU = "src/app/admin/sifremi-unuttum/SifremiUnuttumForm.tsx";

// ---------------------------------------------------------------------------
header("(a) parseAuthLink — giris yollari ve oncelik");
// ---------------------------------------------------------------------------
{
  ok(
    "parse",
    "token_hash + type=recovery",
    parseAuthLink("?token_hash=abc123&type=recovery", ""),
    { route: "token_hash", tokenHash: "abc123", mode: "recovery" },
    "?token_hash=abc123&type=recovery"
  );

  ok(
    "parse",
    "token_hash + type=invite",
    parseAuthLink("?tenant=11111111-1111-1111-1111-111111111111&token_hash=xyz&type=invite", ""),
    { route: "token_hash", tokenHash: "xyz", mode: "invite" },
    "davet + kurum parametresi"
  );

  ok(
    "parse",
    "davet (implicit hash token)",
    parseAuthLink("", "#access_token=AAA&refresh_token=BBB&type=invite"),
    { route: "hash_token", accessToken: "AAA", refreshToken: "BBB", mode: "invite" },
    "#access_token=...&type=invite"
  );

  ok(
    "parse",
    "hash'te type yoksa davet sayilir",
    parseAuthLink("", "#access_token=AAA&refresh_token=BBB"),
    { route: "hash_token", accessToken: "AAA", refreshToken: "BBB", mode: "invite" },
    "type'siz hash"
  );

  ok(
    "parse",
    "implicit sifirlama (P1: sablon degismeden once)",
    parseAuthLink("", "#access_token=AAA&refresh_token=BBB&type=recovery"),
    { route: "hash_token", accessToken: "AAA", refreshToken: "BBB", mode: "recovery" },
    "#...&type=recovery"
  );

  ok("parse", "eski PKCE linki", parseAuthLink("?code=xyz", ""), { route: "pkce" }, "?code=xyz");
  ok("parse", "bos URL", parseAuthLink("", ""), { route: "none" }, "(bos)");

  // 🔴 Hata HER SEYIN onunde: auth-js URL hatasinda mevcut oturumu SILMIYOR;
  //    sayfa hatayi gormezse o oturuma duser ve gecersiz linke tiklayana
  //    sifre formu gosterir (10 Eylul 2026 yan bulgusu).
  ok(
    "parse",
    "hata token_hash'i EZER",
    parseAuthLink(
      "?error=access_denied&error_code=otp_expired&token_hash=abc&type=recovery",
      "#error=access_denied&error_code=otp_expired"
    ).route,
    "error",
    "hata + token_hash birlikte"
  );
  ok(
    "parse",
    "hata hash token'i EZER",
    parseAuthLink("", "#error=access_denied&error_code=otp_expired&access_token=AAA&refresh_token=BBB")
      .route,
    "error",
    "hata + hash token"
  );
  ok(
    "parse",
    "hatanin akisi: query+hash = pkce",
    parseAuthLink("?error_code=otp_expired", "#error_code=otp_expired").error.flow,
    "pkce",
    "ikisinde de hata"
  );

  // Eksik/bilinmeyen parametreler token_hash yolunu ACMAZ.
  ok("parse", "type yoksa token_hash yok sayilir", parseAuthLink("?token_hash=abc", "").route, "none", "type'siz");
  ok("parse", "token_hash yoksa type yok sayilir", parseAuthLink("?type=recovery", "").route, "none", "jetonsuz");
  ok(
    "parse",
    "bilinmeyen type (signup) kabul edilmez",
    parseAuthLink("?token_hash=abc&type=signup", "").route,
    "none",
    "type=signup"
  );
  ok("parse", "bos token_hash kabul edilmez", parseAuthLink("?token_hash=&type=recovery", "").route, "none", "bos jeton");
  ok(
    "parse",
    "token_hash hash token'dan ONCE gelir",
    parseAuthLink("?token_hash=abc&type=recovery", "#access_token=AAA&refresh_token=BBB").route,
    "token_hash",
    "ikisi birden"
  );
  ok(
    "parse",
    "token_hash ?code'dan ONCE gelir",
    parseAuthLink("?code=xyz&token_hash=abc&type=recovery", "").route,
    "token_hash",
    "code + token_hash"
  );
}

// ---------------------------------------------------------------------------
header("(b) 🔴 R2 — AUTH_LINK_JOINER sozlesmesi (cifte soru isareti)");
// ---------------------------------------------------------------------------
{
  ok("joiner", "sifirlama '?' ile baglanir", AUTH_LINK_JOINER.recovery, "?", "AUTH_LINK_JOINER");
  ok("joiner", "davet '&' ile baglanir", AUTH_LINK_JOINER.invite, "&", "AUTH_LINK_JOINER");

  // Sablonun uretecegi linki kodda kurup GERCEK ayristiriciya veriyoruz.
  const sifirlamaLinki = buildTemplateAuthLink(
    buildRecoveryReturnUrl("https://kurmayteknoloji.com"),
    "recovery",
    "HASH123"
  );
  ok(
    "joiner",
    "sifirlama linki tam metin",
    sifirlamaLinki,
    "https://kurmayteknoloji.com/admin/davet-kabul?token_hash=HASH123&type=recovery",
    "buildTemplateAuthLink"
  );
  ok(
    "joiner",
    "sifirlama linki ayristirilabiliyor",
    parseAuthLink(new URL(sifirlamaLinki).search, ""),
    { route: "token_hash", tokenHash: "HASH123", mode: "recovery" },
    sifirlamaLinki
  );

  const davetDonus = buildInviteRedirectUrl({
    id: "22222222-2222-2222-2222-222222222222",
    slug: "kurmay",
  });
  const davetLinki = buildTemplateAuthLink(davetDonus, "invite", "HASH456");
  const davetParams = new URL(davetLinki).searchParams;
  ok("joiner", "davet linki: token_hash okunuyor", davetParams.get("token_hash"), "HASH456", davetLinki);
  ok("joiner", "davet linki: type okunuyor", davetParams.get("type"), "invite", davetLinki);
  ok(
    "joiner",
    "davet linki: kurum KIRLENMEDI",
    davetParams.get("tenant"),
    "22222222-2222-2222-2222-222222222222",
    davetLinki
  );

  // 🔴 ASIL VAKA — sabit yanlis degere cevrilirse ne olur (20 Eylul olcumu).
  //    Bu satirlar "yanlis karakterin sessizce jetonu yok ettigini" kanitlar;
  //    (b)'nin ustteki dogru-yol vakalari da sabit bozulursa KIRILIR.
  const yanlisDavet = `${davetDonus}?token_hash=HASH456&type=invite`;
  const yanlisParams = new URL(yanlisDavet).searchParams;
  ok("joiner", "yanlis '?': token_hash KAYBOLUR", yanlisParams.get("token_hash"), null, yanlisDavet);
  ok(
    "joiner",
    "yanlis '?': kurum kirlenir",
    yanlisParams.get("tenant"),
    "22222222-2222-2222-2222-222222222222?token_hash=HASH456",
    yanlisDavet
  );
  ok(
    "joiner",
    "yanlis '?': ayristirici da bulamaz",
    parseAuthLink(new URL(yanlisDavet).search, "").route,
    "none",
    yanlisDavet
  );

  const yanlisSifirlama = `${buildRecoveryReturnUrl("https://kurmayteknoloji.com")}&token_hash=H&type=recovery`;
  ok(
    "joiner",
    "yanlis '&': yol bozulur, jeton okunmaz",
    parseAuthLink(new URL(yanlisSifirlama).search, "").route,
    "none",
    yanlisSifirlama
  );
}

// ---------------------------------------------------------------------------
header("(c)(d)(h) Donus adresleri ve yol sabiti");
// ---------------------------------------------------------------------------
{
  const donus = buildRecoveryReturnUrl("https://kurmayteknoloji.com");
  ok("donus", "sifirlama donus adresi", donus, "https://kurmayteknoloji.com/admin/davet-kabul", "origin");
  okTrue("donus", "🔴 sifirlama donusu SORGU TASIMAZ", !donus.includes("?"), donus);
  ok(
    "donus",
    "sondaki slash temizlenir",
    buildRecoveryReturnUrl("https://kurmayteknoloji.com///"),
    "https://kurmayteknoloji.com/admin/davet-kabul",
    "slash'li origin"
  );
  okTrue("donus", "yol sabitten geliyor", donus.endsWith(AUTH_RETURN_PATH), AUTH_RETURN_PATH);

  const davetDonus = buildInviteRedirectUrl({ id: "33333333-3333-3333-3333-333333333333", slug: "kurmay" });
  ok("donus", "davet donusu TAM BIR '?' tasir", (davetDonus.match(/\?/g) || []).length, 1, davetDonus);
  okTrue("donus", "davet donusu kurumu tasir", davetDonus.includes("tenant="), davetDonus);

  // Uc dosyadaki yol sabiti ayni olmali (ucu de import'suz tanimli).
  ok("donus", "admin-invite == setup-checklist", AUTH_RETURN_PATH, CHECKLIST_RETURN_PATH, "sabit karsilastirmasi");
  ok("donus", "admin-invite == setup-probes", AUTH_RETURN_PATH, SUPABASE_RETURN_PATH, "sabit karsilastirmasi");
}

// ---------------------------------------------------------------------------
header("(e) 🔴 R1 — StrictMode: kabul sayfasindaki UC onlem");
// ---------------------------------------------------------------------------
{
  const sayfa = read(KABUL_SAYFASI);

  // ONLEM 1 — tek cagri kilidi
  okTrue("r1", "useRef import edildi", /import \{[^}]*useRef[^}]*\} from "react"/.test(sayfa), KABUL_SAYFASI);
  okTrue("r1", "kilit ref'i tanimli", sayfa.includes("const verifyStartedRef = useRef(false)"), "verifyStartedRef");
  okTrue("r1", "ikinci kosu KESILIYOR", sayfa.includes("if (verifyStartedRef.current) return;"), "kilit");
  okTrue("r1", "kilit isaretleniyor", sayfa.includes("verifyStartedRef.current = true;"), "kilit");
  okTrue(
    "r1",
    "kilit verifyOtp'den ONCE",
    comesBefore(sayfa, "if (verifyStartedRef.current) return;", "auth.verifyOtp("),
    "sira"
  );
  okTrue(
    "r1",
    "isaretleme verifyOtp'den ONCE",
    comesBefore(sayfa, "verifyStartedRef.current = true;", "auth.verifyOtp("),
    "sira"
  );

  // ONLEM 2 — jeton URL'den silinir, dogrulamadan ONCE
  okTrue("r1", "token_hash URL'den siliniyor", sayfa.includes('cleaned.searchParams.delete("token_hash")'), "temizlik");
  okTrue("r1", "type URL'den siliniyor", sayfa.includes('cleaned.searchParams.delete("type")'), "temizlik");
  okTrue("r1", "replaceState cagriliyor", sayfa.includes("window.history.replaceState("), "temizlik");
  okTrue(
    "r1",
    "replaceState verifyOtp'den ONCE",
    comesBefore(sayfa, "window.history.replaceState(", "auth.verifyOtp("),
    "sira"
  );
  okTrue(
    "r1",
    "kurum parametresi KORUNUYOR (pathname'e indirilmiyor)",
    sayfa.includes("`${cleaned.pathname}${cleaned.search}${cleaned.hash}`"),
    "replaceState hedefi"
  );

  // ONLEM 3 — dogru istemci: oturum cereze yazilmali
  okTrue("r1", "verifyOtp ssr istemcisiyle", sayfa.includes("createClient().auth.verifyOtp({"), "istemci");
  okTrue(
    "r1",
    "kabul sayfasi PKCE'siz istemciyi KULLANMAZ",
    !sayfa.includes("createAuthMailClient"),
    "istemci ayrimi"
  );

  // Hata yolu: kod ekranda gosterilebilsin
  okTrue("r1", "verifyOtp hatasi linkError'a yaziliyor", sayfa.includes('flow: "token_hash"'), "hata yolu");

  // Mod kaliciligi: jeton URL'den silindigi icin sayfa yenilenirse mod
  // linkten OKUNAMAZ; bayrak olmazsa sifirlama "davet" moduna duser.
  okTrue(
    "r1",
    "recovery modu sessionStorage'a yaziliyor (yenilemede kaybolmasin)",
    comesBefore(sayfa, "sessionStorage.setItem(RECOVERY_FLAG_KEY", "auth.verifyOtp("),
    "mod kaliciligi"
  );
  okTrue(
    "r1",
    "davet gelirse bayrak temizleniyor",
    comesBefore(sayfa, "sessionStorage.removeItem(RECOVERY_FLAG_KEY", "auth.verifyOtp("),
    "mod kaliciligi"
  );
}

// ---------------------------------------------------------------------------
header("(f)(g) Sifirlama formu ve PKCE'siz istemci");
// ---------------------------------------------------------------------------
{
  const form = read(SIFIRLAMA_FORMU);
  okTrue("pkce", "form PKCE'siz istemciyi kuruyor", form.includes("createAuthMailClient()"), SIFIRLAMA_FORMU);
  okTrue(
    "pkce",
    "🔴 form ssr (PKCE) istemcisini KULLANMIYOR",
    !form.includes('from "@/lib/supabase/client"'),
    SIFIRLAMA_FORMU
  );
  okTrue("pkce", "donus adresi yardimcidan", form.includes("buildRecoveryReturnUrl(window.location.origin)"), "donus");
  okTrue(
    "pkce",
    "donus adresi elle kurulmuyor",
    !form.includes("/admin/davet-kabul`"),
    "elle string yok"
  );

  // Yorumlar atilir: dosyanin BASLIGI createBrowserClient'i anlatiyor,
  // iddia "kodda kullanilmiyor" — metne takilmasin.
  const istemci = stripComments(read("src/lib/supabase/auth-mail-client.ts"));
  okTrue("pkce", "flowType implicit", istemci.includes('flowType: "implicit"'), "auth-mail-client");
  okTrue("pkce", "oturum saklanmiyor", istemci.includes("persistSession: false"), "auth-mail-client");
  okTrue("pkce", "URL'e bakilmiyor", istemci.includes("detectSessionInUrl: false"), "auth-mail-client");
  okTrue("pkce", "token yenilenmiyor", istemci.includes("autoRefreshToken: false"), "auth-mail-client");
  okTrue(
    "pkce",
    "🔴 @supabase/ssr KULLANILMIYOR (flowType'i ezilemiyor)",
    !istemci.includes("@supabase/ssr"),
    "auth-mail-client"
  );
  okTrue(
    "pkce",
    "supabase-js'in kendi createClient'i",
    istemci.includes('from "@supabase/supabase-js"'),
    "auth-mail-client"
  );
}

// ---------------------------------------------------------------------------
header("(i) Gecis donemi — eski dallar DURUYOR");
// ---------------------------------------------------------------------------
{
  const sayfa = read(KABUL_SAYFASI);
  // Sablon P2'de degisse bile uctaki eski linkler 1 saat daha yasar
  // (Email OTP Expiration). Bu dallar P3'e kadar SILINMEYECEK.
  okTrue("gecis", "davet dali (setSession) duruyor", sayfa.includes("supabase.auth.setSession({"), "hash token dali");
  okTrue("gecis", "eski PKCE dali (getSession) duruyor", sayfa.includes("supabase.auth.getSession()"), "?code dali");
  okTrue("gecis", "hata dali duruyor", sayfa.includes("parseAuthLinkError("), "hata dali");
}

// ---------------------------------------------------------------------------
header("(j) Super admin panel host'u — kok yol yonlendirmesi");
// ---------------------------------------------------------------------------
{
  const mw = read("src/middleware.ts");
  ok("panel", "hedef sabiti", SUPER_ADMIN_HOME_PATH, "/super-admin", "constants");
  okTrue(
    "panel",
    "kok yol panele yonlendiriliyor",
    mw.includes('if (superAdminHost && pathname === "/") {') &&
      mw.includes("NextResponse.redirect(new URL(SUPER_ADMIN_HOME_PATH, request.url))"),
    "middleware"
  );
  okTrue(
    "panel",
    "🔴 yonlendirme YALNIZ kok yol icin (digerleri 404)",
    mw.includes('if (superAdminHost && !pathname.startsWith("/super-admin")) {') &&
      mw.includes("return notFound();"),
    "fail-closed korundu"
  );
  okTrue(
    "panel",
    "yonlendirme 404 kuralindan ONCE",
    comesBefore(mw, 'if (superAdminHost && pathname === "/") {', 'if (superAdminHost && !pathname.startsWith'),
    "sira"
  );
  okTrue(
    "panel",
    "kural (b) degismedi: diger host'larda /super-admin 404",
    mw.includes('if (!superAdminHost && pathname.startsWith("/super-admin")) {'),
    "kural (b)"
  );
  okTrue(
    "panel",
    "diger host'lara yonlendirme SIZMIYOR",
    !mw.includes("redirect(new URL(SUPER_ADMIN_LOGIN_PATH") ||
      comesBefore(mw, "SUPER_ADMIN_PUBLIC_PATHS", "loginUrl.searchParams.set"),
    "kural (b)"
  );
}

// ---------------------------------------------------------------------------
header("(k) DAVRANIS — istek govdesinde code_challenge var mi? (ag'a CIKILMAZ)");
// ---------------------------------------------------------------------------
{
  // Kaynak metni okumak yetmez: asil soru "/recover istegine ne gidiyor".
  // Global fetch sahte — hicbir istek aga cikmaz, mail gitmez.
  const oncekiFetch = globalThis.fetch;
  const oncekiUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oncekiKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sahte-anon-anahtar";

  const cagrilar = [];
  globalThis.fetch = async (url, init) => {
    cagrilar.push({ url: String(url), body: JSON.parse(init?.body ?? "{}") });
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    // 1) YENI yol — mail tetikleyen istemci
    await createAuthMailClient().auth.resetPasswordForEmail("kimse@ornek.test", {
      redirectTo: "https://kurum.test/admin/davet-kabul",
    });

    ok("davranis", "tek istek atildi", cagrilar.length, 1, "resetPasswordForEmail");
    const yeni = cagrilar[0] ?? { url: "", body: {} };
    okTrue("davranis", "istek /auth/v1/recover'a gidiyor", yeni.url.includes("/auth/v1/recover"), yeni.url);
    ok("davranis", "🔴 code_challenge YOK", yeni.body.code_challenge ?? null, null, "govde");
    ok("davranis", "🔴 code_challenge_method YOK", yeni.body.code_challenge_method ?? null, null, "govde");
    ok(
      "davranis",
      "donus adresi istege ekleniyor",
      new URL(yeni.url).searchParams.get("redirect_to"),
      "https://kurum.test/admin/davet-kabul",
      yeni.url
    );

    // 2) KARSILASTIRMA — ssr istemcisi ayni cagriyi PKCE ile yapar.
    //    Bu satir `auth-mail-client.ts`'in VARLIK SEBEBIDIR: flowType
    //    secenekle ezilemiyor. Burasi kirilirsa (ssr artik PKCE
    //    gondermiyorsa) ayri istemci gerekcesi yeniden degerlendirilmeli.
    const kutu = new Map();
    cagrilar.length = 0;
    await createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        // Node'da cerez deposu yok — minimal sahte
        cookies: {
          getAll: () => [...kutu].map(([name, value]) => ({ name, value })),
          setAll: (list) => list.forEach(({ name, value }) => kutu.set(name, value)),
        },
        auth: { flowType: "implicit" }, // <-- BILEREK: ezilemedigi gosteriliyor
      }
    ).auth.resetPasswordForEmail("kimse@ornek.test", {
      redirectTo: "https://kurum.test/admin/davet-kabul",
    });

    const eski = cagrilar[0] ?? { url: "", body: {} };
    okTrue(
      "davranis",
      "ssr istemcisi code_challenge GONDERIYOR (flowType secenekle ezilemedi)",
      typeof eski.body.code_challenge === "string" && eski.body.code_challenge.length > 0,
      JSON.stringify(eski.body.code_challenge)
    );
    ok("davranis", "ssr istemcisinin yontemi S256", eski.body.code_challenge_method, "s256", "govde");
  } finally {
    globalThis.fetch = oncekiFetch;
    if (oncekiUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = oncekiUrl;
    if (oncekiKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oncekiKey;
  }
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
