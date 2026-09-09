/**
 * Tenant'a admin ekleme testi — 8 Eylul 2026 "davet gonderildi diyor ama mail
 * gitmiyor" canli bug'ini kilitler.
 *
 * CALISTIRMA:
 *   npm run test:tenant-user
 *   (= node scripts/test-tenant-user-add.mjs)
 *
 * BUG NEYDI (regresyon kaydi):
 *   Super admin panelden bir tenant'a admin eklenirken, e-posta Supabase
 *   Auth'ta ZATEN KAYITLIYSA hicbir mail gonderilmiyor ama panel "eklendi /
 *   davet gonderildi" diyordu. Sebep, yutulan bir hata DEGIL — cagrinin hic
 *   yapilmamasiydi:
 *
 *     const existingUser = await findUserByEmail(admin, email);
 *     let userId = existingUser?.id ?? null;
 *     if (!userId) {                       // <-- kullanici VARSA atlanir
 *       await admin.auth.admin.inviteUserByEmail(...)   // HIC CAGRILMAZ
 *     }
 *     ...
 *     toast.success("Admin eklendi.")      // panel sonucu SORMUYOR
 *
 *   Ayni desen create-tenant/route.ts'te de vardi; yeni tenant sayfasi ise
 *   sabit "Admin'e davet gonderildi." yaziyordu. Davet edilen kisi hicbir sey
 *   almiyor, super admin gonderildigini saniyordu.
 *
 * OLCUM (9 Eylul 2026, canli Supabase + custom SMTP/Resend, taze adresler):
 *   | Auth durumu                          | inviteUserByEmail | mail  |
 *   |--------------------------------------|-------------------|-------|
 *   | kayit yok                            | basarili          | GELDI |
 *   | kayitli, daveti hic kabul etmemis    | basarili          | GELDI |
 *   | kayitli, sifresini belirlemis/girmis | 422 email_exists  | yok   |
 *   generateLink() ise link uretir ama MAIL GONDERMEZ (taze adrese hicbir
 *   sey ulasmadi) — "davet gonderiliyor" sanilip kullanilamaz.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) decideAdminInviteAction — uc dal, olculen davranisla birebir
 *   (b) Mesajlar — "linked_existing" dalinda mail gonderildigi SOYLENMEZ
 *   (c) buildInviteRedirectUrl — NEXT_PUBLIC_SITE_URL yoksa "undefined/..."
 *       gibi bozuk URL uretilmez
 *   (d) findUserByEmail — karari besleyen last_sign_in_at/invited_at alanlari
 *       gercekten donuyor, sayfalama caliriyor (eski sozlesme korunuyor)
 *   (e) getUserEmailsByIds — listUsers() sayfalamasi: ilk sayfadan SONRAKI
 *       kullanicilarin e-postasi da bulunur (tenant-users/list bug'i)
 *   (f) Geriye uyumluluk — eski cagri sekilleri ve eski dal davranisi bozulmaz
 *
 * ⚠️ KAPSAM SINIRI (bilincli):
 *   Repoda HTTP/route kosucusu yok; API route'lari (create-tenant,
 *   tenant-users) burada CALISTIRILMAZ. Test, route'larin karar verirken
 *   kullandigi SAF fonksiyonlari ve Supabase yardimcilarini gercek kaynaktan
 *   import eder — sahte olan yalnizca Supabase auth admin client'i. Route'lar
 *   bu fonksiyonlari cagirmayi birakirsa test yesil kalirken davranis kayar;
 *   dal secimini route'larda degistiren biri BURAYI DA guncellemeli.
 *   Mailin gercekten teslim edildigi ancak canli SMTP ile dogrulanir (yukaridaki
 *   olcum tablosu) — birim testi bunu kanitlayamaz.
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import {
  decideAdminInviteAction,
  ADMIN_INVITE_MESSAGES,
  buildInviteRedirectUrl,
} from "../src/lib/super-admin/admin-invite.ts";
import {
  findUserByEmail,
  getUserEmailsByIds,
} from "../src/lib/supabase/admin-helpers.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (test-storage-ownership.mjs / test-tenant-resolve.mjs deseni)
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

/** @param {string} group @param {string} name @param {boolean} cond @param {string} input */
function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}

// ---------------------------------------------------------------------------
// Sahte Supabase auth admin client — listUsers cagrilarini KAYDEDER
// ---------------------------------------------------------------------------
/**
 * @param {Array<Array<object>>} pages 1-indexli sayfalar; pages[0] = sayfa 1
 */
function makeFakeAdmin(pages) {
  const calls = [];
  return {
    calls,
    auth: {
      admin: {
        listUsers: async ({ page, perPage } = {}) => {
          calls.push({ page, perPage });
          return { data: { users: pages[page - 1] ?? [] }, error: null };
        },
      },
    },
  };
}

/** Hata donduren sahte client (fail-closed yollari icin) */
function makeFailingAdmin(message) {
  return {
    auth: {
      admin: {
        listUsers: async () => ({ data: null, error: new Error(message) }),
      },
    },
  };
}

/** Sayfalamayi tetiklemek icin TAM sayfa (1000 kayit) uretir. */
function fillPage(realUsers) {
  const filler = [];
  for (let i = realUsers.length; i < 1000; i++) {
    filler.push(user(`filler-${i}`, `filler${i}@ornek.test`));
  }
  return [...realUsers, ...filler];
}

/** @param {string} id @param {string} email */
function user(id, email, extra = {}) {
  return { id, email, ...extra };
}

// Gercek dunyadaki uc Auth durumu
const NEVER_INVITED = null;
const INVITED_NOT_ACCEPTED = {
  id: "2183a15e-0000-4000-8000-000000000001",
  email: "yeni@kurulus.test",
  invited_at: "2026-09-09T09:38:39.315812Z",
  last_sign_in_at: null,
};
const ACTIVE_USER = {
  id: "2183a15e-0000-4000-8000-000000000002",
  email: "mevcut@kurulus.test",
  invited_at: "2026-08-01T10:00:00.000Z",
  last_sign_in_at: "2026-09-09T09:40:03.444595Z",
};

// ---------------------------------------------------------------------------
console.log("\n(a) decideAdminInviteAction — uc dal\n");

ok(
  "karar",
  "kullanici YOK → davet et",
  decideAdminInviteAction(NEVER_INVITED),
  { kind: "invite", outcome: "invited" },
  "null"
);

ok(
  "karar",
  "kayitli + daveti kabul etmemis → daveti YENIDEN gonder",
  decideAdminInviteAction(INVITED_NOT_ACCEPTED),
  { kind: "reinvite", outcome: "reinvited" },
  "last_sign_in_at=null"
);

// ⬇ ASIL BUG: burasi "invite" donerse 422 email_exists alinir ve kisiye
//   hicbir sey gitmez; eski kod ise hic cagirmayip "gonderildi" diyordu.
ok(
  "karar",
  "kayitli + giris yapmis → SADECE bagla (mail yok)",
  decideAdminInviteAction(ACTIVE_USER),
  { kind: "link_only", outcome: "linked_existing" },
  "last_sign_in_at dolu"
);

// Bos string bir tarih degil — "hic giris yapmamis" sayilmali (fail-safe:
// davet denenir, hata cikarsa invite_failed olarak RAPORLANIR).
ok(
  "karar",
  'last_sign_in_at = "" → yeniden davet (fail-safe)',
  decideAdminInviteAction({ ...INVITED_NOT_ACCEPTED, last_sign_in_at: "" }),
  { kind: "reinvite", outcome: "reinvited" },
  'last_sign_in_at=""'
);

// ---------------------------------------------------------------------------
console.log("\n(b) Mesajlar — panel dogruyu soylemeli\n");

ok("mesaj", "invited mesaji", ADMIN_INVITE_MESSAGES.invited, "Davet gönderildi.", "invited");

// ⬇ Bug'in gorunen yuzu: bu dalda mail GITMEZ. Mesaj bunu soylemezse
//   super admin yine yaniltilmis olur.
okTrue(
  "mesaj",
  "linked_existing 'gönderilmedi' diyor",
  ADMIN_INVITE_MESSAGES.linked_existing.includes("gönderilmedi"),
  ADMIN_INVITE_MESSAGES.linked_existing
);
okTrue(
  "mesaj",
  "linked_existing 'Davet gönderildi' DEMIYOR",
  !ADMIN_INVITE_MESSAGES.linked_existing.includes("Davet gönderildi"),
  ADMIN_INVITE_MESSAGES.linked_existing
);
okTrue(
  "mesaj",
  "linked_existing mevcut sifreyi anlatiyor",
  ADMIN_INVITE_MESSAGES.linked_existing.includes("şifresiyle"),
  ADMIN_INVITE_MESSAGES.linked_existing
);
okTrue(
  "mesaj",
  "invite_failed basarisizligi saklamiyor",
  ADMIN_INVITE_MESSAGES.invite_failed.includes("gönderilemedi"),
  ADMIN_INVITE_MESSAGES.invite_failed
);

// Her outcome'un mesaji olmali — route yeni bir outcome eklerse burada patlar
for (const outcome of ["invited", "reinvited", "linked_existing", "invite_failed"]) {
  okTrue(
    "mesaj",
    `${outcome} mesaji dolu`,
    typeof ADMIN_INVITE_MESSAGES[outcome] === "string" &&
      ADMIN_INVITE_MESSAGES[outcome].length > 0,
    outcome
  );
}

// ---------------------------------------------------------------------------
console.log("\n(c) buildInviteRedirectUrl — bozuk URL uretmemeli\n");

{
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const originalError = console.error;
  let errorCount = 0;
  console.error = () => {
    errorCount++;
  };

  try {
    process.env.NODE_ENV = "development";
    delete process.env.NEXT_PUBLIC_SITE_URL;
    ok(
      "redirect",
      "lokal → tenant subdomain (lvh.me)",
      buildInviteRedirectUrl("egitim-sen"),
      "http://egitim-sen.lvh.me:3000/admin/davet-kabul",
      "NODE_ENV=development"
    );

    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://buyukdirilis.org.tr";
    ok(
      "redirect",
      "production → SITE_URL + /admin/davet-kabul",
      buildInviteRedirectUrl("egitim-sen"),
      "https://buyukdirilis.org.tr/admin/davet-kabul",
      "SITE_URL tanimli"
    );

    process.env.NEXT_PUBLIC_SITE_URL = "https://buyukdirilis.org.tr/";
    ok(
      "redirect",
      "sondaki slash tekillestirilir",
      buildInviteRedirectUrl("egitim-sen"),
      "https://buyukdirilis.org.tr/admin/davet-kabul",
      "SITE_URL sonda slash"
    );

    // ⬇ Eskiden burada "undefined/admin/davet-kabul" uretiliyordu: Supabase
    //   bunu izin listesinde bulamayip sessizce proje Site URL'ine duserdi.
    errorCount = 0;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    ok(
      "redirect",
      "SITE_URL yoksa undefined (bozuk URL YOK)",
      buildInviteRedirectUrl("egitim-sen"),
      undefined,
      "SITE_URL tanimsiz"
    );
    ok("redirect", "SITE_URL yoksa log'a hata yazilir", errorCount, 1, "SITE_URL tanimsiz");
  } finally {
    console.error = originalError;
    process.env.NODE_ENV = originalNodeEnv;
    if (originalSiteUrl === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
    else process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
  }
}

// ---------------------------------------------------------------------------
console.log("\n(d) findUserByEmail — karari besleyen alanlar + sayfalama\n");

{
  const admin = makeFakeAdmin([
    [
      user("id-1", "Mevcut@Kurulus.TEST", {
        invited_at: "2026-08-01T10:00:00.000Z",
        last_sign_in_at: "2026-09-09T09:40:03.444595Z",
      }),
    ],
  ]);
  const found = await findUserByEmail(admin, "mevcut@kurulus.test");

  ok("find", "eski sozlesme: id donuyor", found?.id, "id-1", "mevcut@kurulus.test");
  ok("find", "eski sozlesme: email donuyor", found?.email, "Mevcut@Kurulus.TEST", "mevcut@kurulus.test");
  // ⬇ Adim 1: karar bu iki alana dayaniyor
  ok(
    "find",
    "last_sign_in_at donuyor",
    found?.last_sign_in_at,
    "2026-09-09T09:40:03.444595Z",
    "mevcut@kurulus.test"
  );
  ok("find", "invited_at donuyor", found?.invited_at, "2026-08-01T10:00:00.000Z", "mevcut@kurulus.test");
  ok(
    "find",
    "bulunan kullanici → link_only",
    decideAdminInviteAction(found),
    { kind: "link_only", outcome: "linked_existing" },
    "uctan uca"
  );
}

{
  // Alanlar eksikse undefined DEGIL null donmeli (JSON'a dogru serilesir ve
  // decideAdminInviteAction'a saglam girdi olur).
  const admin = makeFakeAdmin([[user("id-2", "yeni@kurulus.test")]]);
  const found = await findUserByEmail(admin, "yeni@kurulus.test");
  ok("find", "eksik last_sign_in_at → null", found?.last_sign_in_at, null, "alan yok");
  ok("find", "eksik invited_at → null", found?.invited_at, null, "alan yok");
  ok(
    "find",
    "hic giris yapmamis → reinvite",
    decideAdminInviteAction(found),
    { kind: "reinvite", outcome: "reinvited" },
    "uctan uca"
  );
}

{
  const admin = makeFakeAdmin([[user("id-1", "baska@kurulus.test")]]);
  const found = await findUserByEmail(admin, "yok@kurulus.test");
  ok("find", "kayit yoksa null", found, null, "yok@kurulus.test");
  ok(
    "find",
    "null → invite (eski davranis korunuyor)",
    decideAdminInviteAction(found),
    { kind: "invite", outcome: "invited" },
    "uctan uca"
  );
}

{
  // Sayfalama: hedef IKINCI sayfada. Ilk sayfa tam (1000) oldugu icin devam
  // edilmeli.
  const admin = makeFakeAdmin([
    fillPage([]),
    [user("id-hedef", "gec@kurulus.test", { last_sign_in_at: null })],
  ]);
  const found = await findUserByEmail(admin, "gec@kurulus.test");
  ok("find", "2. sayfadaki kullanici bulunur", found?.id, "id-hedef", "sayfa 2");
  ok("find", "iki sayfa istendi", admin.calls.length, 2, "sayfa 2");
  ok("find", "perPage=1000", admin.calls[0].perPage, 1000, "sayfa 1");
}

// ---------------------------------------------------------------------------
console.log("\n(e) getUserEmailsByIds — tenant-users/list sayfalamasi\n");

{
  // ⬇ ASIL BUG (adim 7): eski kod parametresiz listUsers() cagiriyordu ->
  //   yalnizca ILK SAYFA (varsayilan 50). Ilk sayfadan sonraki adminler
  //   panelde "(e-posta yok)" gorunuyordu.
  const admin = makeFakeAdmin([
    fillPage([user("id-ilk", "ilk@kurulus.test")]),
    [user("id-son", "son@kurulus.test"), user("id-baska", "baska@kurulus.test")],
  ]);
  const emails = await getUserEmailsByIds(admin, ["id-ilk", "id-son"]);

  ok("emails", "1. sayfadaki e-posta", emails.get("id-ilk"), "ilk@kurulus.test", "id-ilk");
  ok("emails", "2. sayfadaki e-posta", emails.get("id-son"), "son@kurulus.test", "id-son");
  ok("emails", "yalnizca istenenler", emails.size, 2, "id-ilk,id-son");
  ok("emails", "iki sayfa istendi", admin.calls.length, 2, "sayfa 2");
}

{
  // Hepsi ilk sayfadaysa sonraki sayfa CEKILMEZ (gereksiz istek yok)
  const admin = makeFakeAdmin([fillPage([user("id-a", "a@kurulus.test")]), [user("id-b", "b@kurulus.test")]]);
  const emails = await getUserEmailsByIds(admin, ["id-a"]);
  ok("emails", "erken cikis: tek sayfa", admin.calls.length, 1, "id-a");
  ok("emails", "deger dogru", emails.get("id-a"), "a@kurulus.test", "id-a");
}

{
  const admin = makeFakeAdmin([[user("id-a", "a@kurulus.test")]]);
  const emails = await getUserEmailsByIds(admin, []);
  ok("emails", "bos id listesi → istek YOK", admin.calls.length, 0, "[]");
  ok("emails", "bos id listesi → bos Map", emails.size, 0, "[]");
}

{
  // Bulunamayan id sessizce atlanir; Map'te anahtar OLMAZ (panel
  // "(e-posta yok)" gosterir, uydurma deger uretilmez).
  const admin = makeFakeAdmin([[user("id-a", "a@kurulus.test")]]);
  const emails = await getUserEmailsByIds(admin, ["id-a", "id-silinmis"]);
  ok("emails", "silinmis kullanici anahtari yok", emails.has("id-silinmis"), false, "id-silinmis");
  ok("emails", "kalan e-posta yine doner", emails.get("id-a"), "a@kurulus.test", "id-a");
}

{
  // Fail-closed: listUsers hata verirse yardimci ATAR (route 500 doner);
  // yarim liste sessizce gosterilmez.
  let threw = false;
  try {
    await getUserEmailsByIds(makeFailingAdmin("auth down"), ["id-a"]);
  } catch {
    threw = true;
  }
  okTrue("emails", "listUsers hatasi yutulmaz", threw, "auth down");
}

// ---------------------------------------------------------------------------
console.log("\n(f) Geriye uyumluluk\n");

{
  // Eski cagri sekli: {id, email} (yeni alanlar yok). Karar fail-safe tarafa
  // dusmeli — davet DENENIR; kullanici zaten aktifse 422 alinir ve
  // invite_failed olarak RAPORLANIR. Sessiz "gonderildi" yalanina donmez.
  ok(
    "uyum",
    "eski {id,email} sekli → reinvite (fail-safe)",
    decideAdminInviteAction({ id: "id-1", email: "a@b.test" }),
    { kind: "reinvite", outcome: "reinvited" },
    "{id,email}"
  );
}

{
  // findUserByEmail e-postayi buyuk/kucuk harf duyarsiz eslestirmeye devam
  // ediyor (eski davranis) — degisen tek sey donen alanlarin artmasi.
  const admin = makeFakeAdmin([[user("id-1", "ADMIN@Kurulus.TEST")]]);
  const found = await findUserByEmail(admin, "  admin@kurulus.test  ");
  ok("uyum", "harf duyarsiz + trim eslestirme", found?.id, "id-1", "  admin@kurulus.test  ");
}

{
  // Uc dalin tamami gecerli bir outcome uretir ve her outcome'un mesaji vardir
  // — route'lar ADMIN_INVITE_MESSAGES[outcome] ile mesaj sectigi icin bu
  // zincirin kopmamasi sart.
  for (const [label, input] of [
    ["yok", NEVER_INVITED],
    ["davetli", INVITED_NOT_ACCEPTED],
    ["aktif", ACTIVE_USER],
  ]) {
    const { outcome } = decideAdminInviteAction(input);
    okTrue(
      "uyum",
      `${label} → outcome'un mesaji var`,
      typeof ADMIN_INVITE_MESSAGES[outcome] === "string" &&
        ADMIN_INVITE_MESSAGES[outcome].length > 0,
      outcome
    );
  }
}

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failures.length} kaldi\n`);
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
