/**
 * Bağlantısız (yetim) Auth hesapları testi — 10 Eylül 2026 backlog Madde A.
 *
 * CALISTIRMA:
 *   npm run test:orphan
 *   (= node scripts/test-orphan-users.mjs)
 *
 * BAGLAM:
 *   tenant-users DELETE / delete-tenant, cleanupOrphanUserIfNeeded "error"
 *   donerse (gecici hata) uyeligi kaldirip hesabi birakiyor → 207. Eskiden
 *   bu hesaplar hicbir yerde gorunmuyordu. Artik super admin panelinde
 *   "Baglantisiz Hesaplar" listesi + elle silme var.
 *   Canli olcum (10 Eylul): yetim hesap 0; auth.users'a baglanan 10 FK'nin
 *   hepsi ON DELETE CASCADE → kalici silme engeli yok.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) selectOrphanUsers — uyeligi / super adminligi olan ELENIR, en yeni once
 *   (b) fetchAllUserIds — PostgREST satir siniri (Max rows) yaniti keserse
 *       bile TUM user_id'ler okunur (listUsers ilk-sayfa bug'inin esi)
 *   (c) listOrphanUsers — once Auth, sonra uyelikler (yaris durumu); herhangi
 *       bir okuma hatasi → throw (fail-closed, yarim liste YOK)
 *   (d) cleanupOrphanUserIfNeeded — silme ANINDA yeniden kontrol: uyelik varsa
 *       ya da super adminse SILMEZ; kontrol hatasinda SILMEZ (fail-closed)
 *   (e) describeOrphanAccounts — 207 uyari metni
 *   (f) isUuid + panel yolu tutarliligi (link kirik olmasin)
 *
 * ⚠️ KAPSAM SINIRI (bilincli): route'lar CALISTIRILMAZ (repoda HTTP kosucusu
 *   yok — test-tenant-user-add.mjs ile ayni sinir). Sahte olan yalnizca
 *   Supabase admin client'i; mantik gercek kaynaktan import edilir.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import { existsSync, readFileSync } from "node:fs";
import {
  selectOrphanUsers,
  fetchAllUserIds,
  listOrphanUsers,
  describeOrphanAccounts,
  isUuid,
  ORPHAN_ACCOUNTS_PATH,
} from "../src/lib/super-admin/orphan-users.ts";
import { cleanupOrphanUserIfNeeded } from "../src/lib/super-admin/cleanup-orphan-user.ts";

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

// ---------------------------------------------------------------------------
// Sahte Supabase admin client — sorgu zincirlerini ve cagri sirasini KAYDEDER
// ---------------------------------------------------------------------------
/**
 * @param {object} o
 * @param {Record<string, object[]>} [o.tables]   tablo → satirlar
 * @param {number} [o.maxRows]                    PostgREST "Max rows" (range'i keser)
 * @param {Record<string, Error>} [o.tableErrors] tablo → sorgu hatasi
 * @param {Record<string, object>} [o.rpc]        rpc adi → { data, error }
 * @param {object[][]} [o.authPages]              listUsers sayfalari (1-indexli)
 * @param {Error|null} [o.listUsersError]
 * @param {Error|null} [o.deleteUserError]
 */
function makeFake({
  tables = {},
  maxRows = 1000,
  tableErrors = {},
  rpc = {},
  authPages = [[]],
  listUsersError = null,
  deleteUserError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const st = { eq: [], neq: [], range: null, count: false, head: false, order: null };
      const builder = {
        select(_cols, opts = {}) {
          st.count = !!opts.count;
          st.head = !!opts.head;
          return builder;
        },
        order(col) {
          st.order = col;
          return builder;
        },
        range(from, to) {
          st.range = [from, to];
          return builder;
        },
        eq(col, val) {
          st.eq.push([col, val]);
          return builder;
        },
        neq(col, val) {
          st.neq.push([col, val]);
          return builder;
        },
        then(resolve, reject) {
          calls.push({ kind: "from", table, order: st.order, range: st.range });
          let result;
          if (tableErrors[table]) {
            result = { data: null, error: tableErrors[table], count: null };
          } else {
            let rows = (tables[table] || []).filter(
              (r) =>
                st.eq.every(([c, v]) => r[c] === v) && st.neq.every(([c, v]) => r[c] !== v)
            );
            if (st.order) {
              rows = [...rows].sort((x, y) => String(x[st.order]).localeCompare(String(y[st.order])));
            }
            const total = rows.length;
            if (st.head) {
              result = { data: null, error: null, count: total };
            } else {
              let out = rows;
              if (st.range) {
                const [from, to] = st.range;
                out = rows.slice(from, Math.min(to + 1, from + maxRows));
              } else {
                out = rows.slice(0, maxRows);
              }
              result = { data: out, error: null, count: st.count ? total : null };
            }
          }
          return Promise.resolve(result).then(resolve, reject);
        },
      };
      return builder;
    },
    rpc(name, args) {
      calls.push({ kind: "rpc", name, args });
      return Promise.resolve(rpc[name] ?? { data: null, error: null });
    },
    auth: {
      admin: {
        listUsers: async ({ page, perPage }) => {
          calls.push({ kind: "listUsers", page, perPage });
          if (listUsersError) return { data: null, error: listUsersError };
          return { data: { users: authPages[page - 1] ?? [] }, error: null };
        },
        deleteUser: async (id) => {
          calls.push({ kind: "deleteUser", id });
          return { error: deleteUserError };
        },
      },
    },
  };
}

const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const au = (n, created_at, extra = {}) => ({
  id: uid(n),
  email: `kisi${n}@kurulus.test`,
  created_at,
  ...extra,
});

// ---------------------------------------------------------------------------
header("(a) selectOrphanUsers — uyelik / super admin elenir");

{
  const users = [
    au(1, "2026-09-01T10:00:00Z"), // uye
    au(2, "2026-09-02T10:00:00Z"), // super admin
    au(3, "2026-09-03T10:00:00Z", { last_sign_in_at: "2026-09-04T10:00:00Z" }),
    au(4, "2026-09-05T10:00:00Z"),
  ];
  const out = selectOrphanUsers(users, [uid(1)], [uid(2)]);
  ok("secim", "yalniz uyeliksiz + super admin olmayanlar", out.map((u) => u.id), [uid(4), uid(3)], "1=uye 2=SA");
  ok("secim", "en yeni once (created_at DESC)", out[0].id, uid(4), "4 en yeni");
  ok("secim", "last_sign_in_at tasinir", out[1].last_sign_in_at, "2026-09-04T10:00:00Z", "kisi3");
  ok("secim", "eksik alanlar null", out[0].last_sign_in_at, null, "kisi4");
}

{
  ok(
    "secim",
    "ayni kisi birden cok kurumda → yine ELENIR",
    selectOrphanUsers([au(1, "2026-09-01T10:00:00Z")], [uid(1), uid(1)], []),
    [],
    "cift uyelik"
  );
  ok(
    "secim",
    "e-posta yoksa bos string (panel '(e-posta yok)' gosterir)",
    selectOrphanUsers([{ id: uid(9), email: null, created_at: null }], [], [])[0].email,
    "",
    "email=null"
  );
  ok(
    "secim",
    "tarihi okunamayan en sona",
    selectOrphanUsers(
      [au(1, "gecersiz"), au(2, "2026-09-02T10:00:00Z")],
      [],
      []
    ).map((u) => u.id),
    [uid(2), uid(1)],
    "created_at=gecersiz"
  );
}

// ---------------------------------------------------------------------------
header("(b) fetchAllUserIds — satir siniri yaniti kesse de hepsi okunur");

{
  const rows = Array.from({ length: 2500 }, (_, i) => ({ id: uid(i + 1), user_id: uid(10000 + i) }));
  const fake = makeFake({ tables: { tenant_users: rows } });
  const ids = await fetchAllUserIds(fake, "tenant_users");
  ok("sayfa", "2500 satirin hepsi", ids.length, 2500, "maxRows=1000");
  ok(
    "sayfa",
    "3 sayfa, range 0-999 / 1000-1999 / 2000-2999",
    fake.calls.map((c) => c.range),
    [[0, 999], [1000, 1999], [2000, 2999]],
    "maxRows=1000"
  );
  ok("sayfa", "tenant_users birincil anahtarla siralanir (id)", fake.calls[0].order, "id", "kararli siralama");
}

{
  // Sunucu sayfa basina ISTENENDEN AZ satir donduruyor (Max rows = 500):
  // "az geldi → bitti" varsayimi olsaydi 500'de durulurdu.
  const rows = Array.from({ length: 1200 }, (_, i) => ({ id: uid(i + 1), user_id: uid(20000 + i) }));
  const fake = makeFake({ tables: { tenant_users: rows }, maxRows: 500 });
  const ids = await fetchAllUserIds(fake, "tenant_users");
  ok("sayfa", "Max rows 500 iken 1200 satirin hepsi", ids.length, 1200, "maxRows=500");
  ok(
    "sayfa",
    "donen kadar ilerlenir (0 / 500 / 1000)",
    fake.calls.map((c) => c.range[0]),
    [0, 500, 1000],
    "maxRows=500"
  );
}

{
  const fake = makeFake({ tables: { super_admins: [{ user_id: uid(1) }] } });
  await fetchAllUserIds(fake, "super_admins");
  ok("sayfa", "super_admins user_id ile siralanir (PK)", fake.calls[0].order, "user_id", "PK");

  let threw = false;
  try {
    await fetchAllUserIds(makeFake({ tableErrors: { tenant_users: new Error("db down") } }), "tenant_users");
  } catch {
    threw = true;
  }
  okTrue("sayfa", "sorgu hatasi yutulmaz (throw)", threw, "db down");
}

// ---------------------------------------------------------------------------
header("(c) listOrphanUsers — sira + fail-closed");

{
  const fake = makeFake({
    authPages: [[au(1, "2026-09-01T10:00:00Z"), au(2, "2026-09-02T10:00:00Z"), au(3, "2026-09-03T10:00:00Z")]],
    tables: {
      tenant_users: [{ id: uid(100), user_id: uid(1) }],
      super_admins: [{ user_id: uid(2) }],
    },
  });
  const out = await listOrphanUsers(fake);
  ok("liste", "uctan uca: yalniz kisi3", out.map((u) => u.id), [uid(3)], "1=uye 2=SA 3=bos");
  // ⬇ SIRA: once Auth, sonra uyelikler. Arada davetle eklenen biri (once
  //   hesap, sonra uyelik) "baglantisiz" diye yanlis gorunmesin.
  ok("liste", "ilk cagri listUsers (Auth once)", fake.calls[0].kind, "listUsers", "cagri sirasi");
}

{
  // ⬇ Kesik uyelik listesi regresyonu: 1200 uyelik, Max rows 1000. Sayfalama
  //   olmasaydi 1001+. satirdaki uye "baglantisiz" gorunurdu.
  const members = Array.from({ length: 1200 }, (_, i) => ({ id: uid(i + 1), user_id: uid(30000 + i) }));
  const fake = makeFake({
    authPages: [[au(31100, "2026-09-01T10:00:00Z"), au(99999, "2026-09-02T10:00:00Z")]],
    tables: { tenant_users: members, super_admins: [] },
  });
  const out = await listOrphanUsers(fake);
  ok("liste", "1100. uyelikteki kisi listede YOK", out.map((u) => u.id), [uid(99999)], "maxRows=1000");
}

for (const [label, opts] of [
  ["listUsers hatasi", { listUsersError: new Error("auth down") }],
  ["tenant_users hatasi", { tableErrors: { tenant_users: new Error("db down") } }],
  ["super_admins hatasi", { tableErrors: { super_admins: new Error("db down") } }],
]) {
  let threw = false;
  try {
    await listOrphanUsers(makeFake(opts));
  } catch {
    threw = true;
  }
  okTrue("liste", `${label} → throw (yarim liste YOK)`, threw, label);
}

// ---------------------------------------------------------------------------
header("(d) cleanupOrphanUserIfNeeded — silme ANINDA yeniden kontrol");

{
  // ⬇ Liste acikken kisi bir kuruma eklendi: panel "Sil"e basilsa bile SILINMEZ.
  const fake = makeFake({ tables: { tenant_users: [{ id: uid(1), user_id: uid(5), tenant_id: uid(700) }] } });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(5));
  ok("silme", "uyeligi var → multi-tenant, SILINMEZ", r, { deleted: false, reason: "multi-tenant" }, "uyelik=1");
  ok("silme", "deleteUser cagrilmadi", fake.calls.filter((c) => c.kind === "deleteUser").length, 0, "uyelik=1");
}

{
  const fake = makeFake({ rpc: { is_super_admin: { data: true, error: null } } });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(6));
  ok("silme", "super admin → SILINMEZ", r, { deleted: false, reason: "super-admin" }, "SA");
  ok("silme", "deleteUser cagrilmadi", fake.calls.filter((c) => c.kind === "deleteUser").length, 0, "SA");
}

{
  const fake = makeFake({ rpc: { is_super_admin: { data: null, error: { message: "rpc down" } } } });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(7));
  ok("silme", "super admin kontrolu hatasi → error, SILINMEZ (fail-closed)", r, { deleted: false, reason: "error", error: "rpc down" }, "rpc down");
  ok("silme", "deleteUser cagrilmadi", fake.calls.filter((c) => c.kind === "deleteUser").length, 0, "rpc down");
}

{
  const fake = makeFake({ tableErrors: { tenant_users: { message: "count down" } } });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(8));
  ok("silme", "uyelik sayimi hatasi → error, SILINMEZ", r, { deleted: false, reason: "error", error: "count down" }, "count down");
}

{
  const fake = makeFake({ rpc: { is_super_admin: { data: false, error: null } } });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(9));
  ok("silme", "baglantisiz + SA degil → silinir", r, { deleted: true }, "temiz");
  ok(
    "silme",
    "deleteUser tam 1 kez, dogru id ile",
    fake.calls.filter((c) => c.kind === "deleteUser").map((c) => c.id),
    [uid(9)],
    "temiz"
  );
}

{
  // A2: kalici engel yok; bu dal yalniz GECICI hatada (ag / zaman asimi).
  const fake = makeFake({
    rpc: { is_super_admin: { data: false, error: null } },
    deleteUserError: { message: "fetch failed" },
  });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(10));
  ok("silme", "deleteUser gecici hatasi → error (tekrar denenebilir)", r, { deleted: false, reason: "error", error: "fetch failed" }, "fetch failed");
}

{
  // tenant-users DELETE "once karar" deseni korunuyor: yalniz kaldirilan
  // kurumdaki uyelik varken excludeTenantId ile "baglantisiz kalacak" sayilir.
  const fake = makeFake({
    tables: { tenant_users: [{ id: uid(1), user_id: uid(11), tenant_id: uid(800) }] },
    rpc: { is_super_admin: { data: false, error: null } },
  });
  const r = await cleanupOrphanUserIfNeeded(fake, uid(11), uid(800));
  ok("silme", "excludeTenantId: yalniz o kurumdaysa silinir (eski davranis)", r, { deleted: true }, "exclude=800");
}

// ---------------------------------------------------------------------------
header("(e) describeOrphanAccounts — 207 uyari metni");

ok("mesaj", "tek e-posta", describeOrphanAccounts(["a@x.test"]), "a@x.test", "1");
ok("mesaj", "uc e-posta", describeOrphanAccounts(["a@x", "b@x", "c@x"]), "a@x, b@x, c@x", "3");
ok(
  "mesaj",
  "ucten fazlasi 've N hesap daha'",
  describeOrphanAccounts(["a@x", "b@x", "c@x", "d@x", "e@x"]),
  "a@x, b@x, c@x ve 2 hesap daha",
  "5"
);
ok("mesaj", "e-postasi bilinmeyen sayilir", describeOrphanAccounts([null, "a@x"]), "a@x ve 1 hesap daha", "[null,a]");
ok("mesaj", "hic e-posta yoksa sayi", describeOrphanAccounts([null, undefined]), "2 hesap", "[null,undefined]");

// ---------------------------------------------------------------------------
header("(f) isUuid + panel yolu tutarliligi");

ok("uuid", "gecerli UUID", isUuid(uid(1)), true, uid(1));
ok("uuid", "buyuk harf de gecerli", isUuid(uid(1).toUpperCase()), true, "UPPER");
ok("uuid", "slug gecersiz", isUuid("egitim-sen"), false, "egitim-sen");
ok("uuid", "bos gecersiz", isUuid(""), false, '""');
ok("uuid", "null gecersiz", isUuid(null), false, "null");
ok("uuid", "enjeksiyon gecersiz", isUuid(`${uid(1)}' OR 1=1`), false, "inj");

{
  // 207 uyarisindaki baglanti kirik olmasin: sayfa dosyasi ve sidebar ayni yolu kullanmali.
  const pageFile = `src/app${ORPHAN_ACCOUNTS_PATH}/page.tsx`;
  okTrue("yol", "sayfa dosyasi var", existsSync(pageFile), pageFile);
  const sidebar = readFileSync("src/components/super-admin/SuperAdminSidebar.tsx", "utf8");
  okTrue("yol", "sidebar ayni yola bagli", sidebar.includes(`href: "${ORPHAN_ACCOUNTS_PATH}"`), ORPHAN_ACCOUNTS_PATH);
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
