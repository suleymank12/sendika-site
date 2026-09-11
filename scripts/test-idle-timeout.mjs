/**
 * Oturum zaman asimi — saf mantik + karar kontrolleri.
 *
 * CALISTIRMA:
 *   npm run test:idle
 *   (= node scripts/test-idle-timeout.mjs)
 *
 * KAPSAM:
 *   - src/lib/idle-timeout.ts (saf; gercek kaynaktan import edilir)
 *   - Onaylanan tasarim kararlarinin kaynakta durdugunu dogrulayan metin
 *     kontrolleri: saglayici iki shell'de, 5 yukleme noktasinda tutma,
 *     scope: local, uyari diyalogu YOK, sure = 30 dk.
 *   Tarayici davranisi (olay yakalama, sekmeler arasi): NOTE.md manuel
 *   test listesi.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import { existsSync, readFileSync } from "node:fs";
import {
  IDLE_ACTIVITY_EVENTS,
  IDLE_FUTURE_TOLERANCE_MS,
  IDLE_STORAGE_KEY,
  IDLE_WRITE_THROTTLE_MS,
  buildIdleLoginUrl,
  effectiveLastActivity,
  evaluateIdle,
  initialActivity,
  isCredibleStored,
  isIdleExpired,
  parseStoredActivity,
  serializeActivity,
  sessionIdFromAccessToken,
  shouldWriteActivity,
} from "../src/lib/idle-timeout.ts";
import { OTURUM_ZAMAN_ASIMI } from "../src/lib/constants.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (test-parse-hostname.mjs ile ayni desen)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

/** @param {string} group @param {string} name @param {unknown} actual @param {unknown} expected */
function ok(group, name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

const MIN = 60_000;
const T = 30 * MIN;
const NOW = 1_800_000_000_000; // sabit saat
const SID = "7c1f3a9e-2b4d-4e8a-9f60-1d2c3b4a5e6f";
const OTHER = "0a0b0c0d-1111-2222-3333-444455556666";

// ---------------------------------------------------------------------------
// Sabitler ve karar kayitlari
// ---------------------------------------------------------------------------
ok(
  "sabit",
  "OTURUM_ZAMAN_ASIMI.SURE_DK = 30 (elle test icin kisaltildiysa commit'ten ONCE geri alin)",
  OTURUM_ZAMAN_ASIMI.SURE_DK,
  30
);
ok("sabit", "localStorage anahtari", IDLE_STORAGE_KEY, "oturum-son-etkinlik");
ok(
  "olaylar",
  "sayilan olaylar = onaylanan liste",
  [...IDLE_ACTIVITY_EVENTS].sort(),
  ["input", "keydown", "pointerdown", "scroll", "touchstart", "wheel"]
);
ok("olaylar", "mousemove SAYILMAZ", IDLE_ACTIVITY_EVENTS.includes("mousemove"), false);
ok("olaylar", "pointermove SAYILMAZ", IDLE_ACTIVITY_EVENTS.includes("pointermove"), false);

// ---------------------------------------------------------------------------
// parseStoredActivity / serializeActivity
// ---------------------------------------------------------------------------
ok("kayit", "gecerli", parseStoredActivity('{"t":123,"s":"abc"}'), { t: 123, s: "abc" });
ok("kayit", "null", parseStoredActivity(null), null);
ok("kayit", "bos metin", parseStoredActivity(""), null);
ok("kayit", "bozuk JSON", parseStoredActivity("{t:1"), null);
ok("kayit", "s yok", parseStoredActivity('{"t":1}'), null);
ok("kayit", "s bos", parseStoredActivity('{"t":1,"s":""}'), null);
ok("kayit", "t metin", parseStoredActivity('{"t":"1","s":"a"}'), null);
ok("kayit", "t sonlu degil (1e999)", parseStoredActivity('{"t":1e999,"s":"a"}'), null);
ok("kayit", "dizi", parseStoredActivity("[1,2]"), null);
ok("kayit", "sayi", parseStoredActivity("5"), null);
ok("kayit", "JSON null", parseStoredActivity("null"), null);
ok("kayit", "yaz-oku donusu", parseStoredActivity(serializeActivity(NOW, SID)), { t: NOW, s: SID });

// ---------------------------------------------------------------------------
// sessionIdFromAccessToken
// ---------------------------------------------------------------------------
/** @param {object} payload */
function jwt(payload) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.imza`;
}
ok("jwt", "session_id okunur", sessionIdFromAccessToken(jwt({ sub: "u1", session_id: SID })), SID);
// base64url'e ozgu - ve _ karakterleri + dolgu (=) olmayan uzunluklar
const urlSafe = jwt({ session_id: SID, x: "~~~>>>???" });
ok("jwt", "(on kosul) payload - ya da _ iceriyor", /[-_]/.test(urlSafe.split(".")[1]), true);
ok("jwt", "base64url karakterleri cozulur", sessionIdFromAccessToken(urlSafe), SID);
ok("jwt", "dolgu gerektiren uzunluk (1)", sessionIdFromAccessToken(jwt({ session_id: SID, p: "a" })), SID);
ok("jwt", "dolgu gerektiren uzunluk (2)", sessionIdFromAccessToken(jwt({ session_id: SID, p: "ab" })), SID);
ok(
  "jwt",
  "Turkce karakterli metadata bozmaz",
  sessionIdFromAccessToken(jwt({ session_id: SID, user_metadata: { ad: "Şükrü Çağlar Öztürk" } })),
  SID
);
ok("jwt", "session_id yok", sessionIdFromAccessToken(jwt({ sub: "u1" })), null);
ok("jwt", "session_id bos", sessionIdFromAccessToken(jwt({ session_id: "" })), null);
ok("jwt", "session_id sayi", sessionIdFromAccessToken(jwt({ session_id: 42 })), null);
ok("jwt", "tek parca", sessionIdFromAccessToken("abc"), null);
ok("jwt", "payload JSON degil", sessionIdFromAccessToken("a.bm90LWpzb24.c"), null);
ok("jwt", "payload JSON null", sessionIdFromAccessToken(`a.${Buffer.from("null").toString("base64url")}.c`), null);
ok("jwt", "undefined", sessionIdFromAccessToken(undefined), null);
ok("jwt", "bos", sessionIdFromAccessToken(""), null);

// ---------------------------------------------------------------------------
// isCredibleStored / initialActivity
// ---------------------------------------------------------------------------
ok("inandirici", "ayni oturum, gecmis", isCredibleStored({ t: NOW - MIN, s: SID }, SID, NOW), true);
ok("inandirici", "baska oturum", isCredibleStored({ t: NOW - MIN, s: OTHER }, SID, NOW), false);
ok("inandirici", "oturum bilinmiyor", isCredibleStored({ t: NOW - MIN, s: SID }, null, NOW), false);
ok("inandirici", "kayit yok", isCredibleStored(null, SID, NOW), false);
ok("inandirici", "pay icinde ileri", isCredibleStored({ t: NOW + IDLE_FUTURE_TOLERANCE_MS, s: SID }, SID, NOW), true);
ok("inandirici", "paydan ileri (saat oynanmis)", isCredibleStored({ t: NOW + IDLE_FUTURE_TOLERANCE_MS + 1, s: SID }, SID, NOW), false);

ok(
  "baslangic",
  "ayni oturumun eski kaydi -> oradan devam (kapatilip acilan sekme)",
  initialActivity({ t: NOW - 3 * 60 * MIN, s: SID }, SID, NOW),
  { last: NOW - 3 * 60 * MIN, fresh: false }
);
ok(
  "baslangic",
  "baska oturumun kaydi -> yeni sayac (yeni giris hemen ATILMAZ)",
  initialActivity({ t: NOW - 3 * 60 * MIN, s: OTHER }, SID, NOW),
  { last: NOW, fresh: true }
);
ok("baslangic", "kayit yok -> yeni sayac", initialActivity(null, SID, NOW), { last: NOW, fresh: true });
ok(
  "baslangic",
  "ileri tarihli kayit -> yeni sayac (kayit ustune yazilir)",
  initialActivity({ t: NOW + 2 * 60 * MIN, s: SID }, SID, NOW),
  { last: NOW, fresh: true }
);

// ---------------------------------------------------------------------------
// effectiveLastActivity
// ---------------------------------------------------------------------------
ok("son", "ayni oturum, kayit daha yeni -> kayit", effectiveLastActivity(NOW - 20 * MIN, { t: NOW - 5 * MIN, s: SID }, SID, NOW), NOW - 5 * MIN);
ok("son", "ayni oturum, bellek daha yeni -> bellek", effectiveLastActivity(NOW - 5 * MIN, { t: NOW - 20 * MIN, s: SID }, SID, NOW), NOW - 5 * MIN);
ok("son", "baska oturumun kaydi yok sayilir", effectiveLastActivity(NOW - 40 * MIN, { t: NOW - MIN, s: OTHER }, SID, NOW), NOW - 40 * MIN);
ok("son", "oturum bilinmiyorsa kayit yok sayilir", effectiveLastActivity(NOW - 40 * MIN, { t: NOW - MIN, s: SID }, null, NOW), NOW - 40 * MIN);
ok("son", "ileri tarihli kayit yok sayilir", effectiveLastActivity(NOW - 31 * MIN, { t: NOW + 2 * 60 * MIN, s: SID }, SID, NOW), NOW - 31 * MIN);
ok("son", "ileride kalan bellek simdiye kirpilir", effectiveLastActivity(NOW + 5 * MIN, null, SID, NOW), NOW);

// ---------------------------------------------------------------------------
// isIdleExpired sinirlari
// ---------------------------------------------------------------------------
ok("sure", "tam 30 dk -> doldu", isIdleExpired(NOW - T, NOW, T), true);
ok("sure", "30 dk - 1 ms -> dolmadi", isIdleExpired(NOW - T + 1, NOW, T), false);
ok("sure", "az once -> dolmadi", isIdleExpired(NOW, NOW, T), false);

// ---------------------------------------------------------------------------
// evaluateIdle — senaryolar
// ---------------------------------------------------------------------------
/** @param {Partial<{memoryLast:number, stored:object|null, sessionId:string|null, holds:number}>} o */
const ev = (o) =>
  evaluateIdle({ now: NOW, memoryLast: NOW, stored: null, sessionId: SID, holds: 0, timeoutMs: T, ...o });

ok("senaryo", "31 dk islem yok -> cikis", ev({ memoryLast: NOW - 31 * MIN }), { last: NOW - 31 * MIN, expired: true });
ok("senaryo", "29 dk islem yok -> devam", ev({ memoryLast: NOW - 29 * MIN }), { last: NOW - 29 * MIN, expired: false });
ok("senaryo", "yukleme suruyor (2 saat dokunulmadi) -> devam, sayac durur", ev({ memoryLast: NOW - 120 * MIN, holds: 1 }), { last: NOW, expired: false });
ok(
  "senaryo",
  "coklu sekme: bu sekme 40 dk bos, oteki 5 dk once etkin -> devam",
  ev({ memoryLast: NOW - 40 * MIN, stored: { t: NOW - 5 * MIN, s: SID } }),
  { last: NOW - 5 * MIN, expired: false }
);
ok(
  "senaryo",
  "coklu sekme: yeni kayit BASKA oturumun -> cikis",
  ev({ memoryLast: NOW - 40 * MIN, stored: { t: NOW - MIN, s: OTHER } }),
  { last: NOW - 40 * MIN, expired: true }
);
ok(
  "senaryo",
  "kapatilip 3 saat sonra acilan sekme (baslangic = kayit) -> hemen cikis",
  ev({ memoryLast: NOW - 180 * MIN, stored: { t: NOW - 180 * MIN, s: SID } }),
  { last: NOW - 180 * MIN, expired: true }
);
ok(
  "senaryo",
  "ileri tarihli kayit oturumu acik TUTAMAZ",
  ev({ memoryLast: NOW - 31 * MIN, stored: { t: NOW + 10 * 60 * MIN, s: SID } }),
  { last: NOW - 31 * MIN, expired: true }
);

// ---------------------------------------------------------------------------
// shouldWriteActivity
// ---------------------------------------------------------------------------
ok("yazma", "hic yazilmadi -> yaz", shouldWriteActivity(0, NOW), true);
ok("yazma", "kisitlama icinde -> yazma", shouldWriteActivity(NOW - IDLE_WRITE_THROTTLE_MS + 1, NOW), false);
ok("yazma", "kisitlama doldu -> yaz", shouldWriteActivity(NOW - IDLE_WRITE_THROTTLE_MS, NOW), true);

// ---------------------------------------------------------------------------
// buildIdleLoginUrl
// ---------------------------------------------------------------------------
ok(
  "adres",
  "zaman asimi + kirli + next",
  buildIdleLoginUrl({ expired: true, dirty: true, next: "/admin/haberler/abc?x=1" }),
  "/admin/giris?oturum=zaman-asimi&kaydedilmemis=1&next=%2Fadmin%2Fhaberler%2Fabc%3Fx%3D1"
);
ok("adres", "yalniz zaman asimi", buildIdleLoginUrl({ expired: true, dirty: false, next: null }), "/admin/giris?oturum=zaman-asimi");
ok(
  "adres",
  "baska sekmeden elle cikis (mesaj yok) + next",
  buildIdleLoginUrl({ expired: false, dirty: false, next: "/super-admin/tenants" }),
  "/admin/giris?next=%2Fsuper-admin%2Ftenants"
);
ok("adres", "hicbiri", buildIdleLoginUrl({ expired: false, dirty: false, next: null }), "/admin/giris");
ok("adres", "guvensiz next: //host", buildIdleLoginUrl({ expired: true, dirty: false, next: "//evil.com" }), "/admin/giris?oturum=zaman-asimi");
ok("adres", "guvensiz next: /\\host", buildIdleLoginUrl({ expired: true, dirty: false, next: "/\\evil.com" }), "/admin/giris?oturum=zaman-asimi");
ok("adres", "guvensiz next: mutlak URL", buildIdleLoginUrl({ expired: true, dirty: false, next: "https://evil.com" }), "/admin/giris?oturum=zaman-asimi");
{
  const url = new URL(buildIdleLoginUrl({ expired: true, dirty: true, next: "/admin/sayfalar/1?a=b&c=d" }), "https://x");
  ok("adres", "giris formu next'i birebir geri okur", url.searchParams.get("next"), "/admin/sayfalar/1?a=b&c=d");
  ok("adres", "giris formu oturum parametresini okur", url.searchParams.get("oturum"), "zaman-asimi");
}

// ---------------------------------------------------------------------------
// Kaynak kontrolleri — onaylanan kararlar kodda duruyor mu?
// ---------------------------------------------------------------------------
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

const adminShell = read("src/components/admin/AdminShell.tsx");
ok(
  "karar",
  "AdminShell: saglayici DirtyFormProvider'in ICINDE (kirli formu okur)",
  adminShell.indexOf("<DirtyFormProvider>") !== -1 &&
    adminShell.indexOf("<IdleTimeoutProvider>") > adminShell.indexOf("<DirtyFormProvider>") &&
    adminShell.indexOf("</IdleTimeoutProvider>") < adminShell.indexOf("</DirtyFormProvider>"),
  true
);
ok("karar", "SuperAdminShell: saglayici bagli (super admin de 30 dk)", read("src/components/super-admin/SuperAdminShell.tsx").includes("<IdleTimeoutProvider>"), true);

for (const f of [
  "src/components/admin/ImageUploader.tsx",
  "src/components/admin/MediaSection.tsx",
  "src/components/admin/MediaUploader.tsx",
  "src/components/admin/RichTextEditor.tsx",
  "src/app/admin/(authenticated)/galeri/[id]/page.tsx",
]) {
  ok("karar", `yukleme tutmasi: ${f}`, read(f).includes("useIdleHold(uploading)"), true);
}

const hook = read("src/hooks/useIdleTimeout.tsx");
ok("karar", "otomatik cikis scope: local (baska cihaz dusmez)", hook.includes('signOut({ scope: "local" })'), true);
ok("karar", "otomatik cikis onay SORMAZ (confirmLeave cagrilmaz)", hook.includes("confirmLeave("), false);
ok("karar", "otomatik cikis location.replace ile (geri tusu donmez)", hook.includes("window.location.replace("), true);
ok("karar", "uyari diyalogu YOK (musteri karari)", existsSync(new URL("../src/components/admin/IdleWarningDialog.tsx", import.meta.url)), false);

ok(
  "karar",
  "beforeunload dinleyicisi ref'e bakar (setDirty(false) aninda etkisiz)",
  read("src/hooks/useDirtyForm.tsx").includes("if (!dirtyRef.current) return;"),
  true
);

const login = read("src/app/admin/giris/AdminLoginForm.tsx");
ok("karar", "giris sayfasi zaman asimi mesajini okur", login.includes('searchParams.get("oturum") === "zaman-asimi"'), true);
ok("karar", "giris sayfasi kayip bildirimini okur", login.includes('searchParams.get("kaydedilmemis") === "1"'), true);

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failures.length} kaldi\n`);
process.exit(failures.length === 0 ? 0 : 1);
