/**
 * delete-tenant storage temizliği testi — 10 Eylül 2026 backlog Madde B.
 *
 * CALISTIRMA:
 *   npm run test:storage-purge
 *   (= node scripts/test-tenant-storage-purge.mjs)
 *
 * BAGLAM:
 *   delete-tenant kurumu siliyordu ama storage'a hic dokunmuyordu:
 *   images/{tenant_id}/... bucket'ta kaliyordu. Artik kurum DB'den silindikten
 *   SONRA temizleniyor (en iyi caba, 20 sn butce); gecmis/kalan yetimler icin
 *   scripts/sweep-orphan-storage.mjs var. Servis anahtari storage RLS'ini
 *   ATLADIGI icin koruma tamamen koddadir — bu test o korumayi kilitler.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) kimlik guard'lari — gecerli UUID, varsayilan kurum reddi (tohumla ayni UUID)
 *   (b) isTenantOwnedPath — SEGMENT karsilastirmasi (duz prefix yanilmasi yok, ".." yok)
 *   (c) listTenantFiles — ozyinelemeli + sayfali; sunucu AZ kayit dondurse de
 *       hepsi; kok ASLA listelenmez; guvensiz ad gezilmez
 *   (d) purgeTenantStorage guard'lari — kurum VARSA / kontrol hata verirse /
 *       varsayilan kurumsa HICBIR SEY silinmez (silmeden hemen onceki ikinci
 *       kontrol dahil)
 *   (e) .remove() argumanlari — yalniz o kurumun yollari, 100'luk gruplar,
 *       yabanci kurum ve kok dosyalari yerinde
 *   (f) kismi sonuclar — sure butcesi, grup hatasi, silinemeyen dosya
 *   (g) describeStorageLeftover — super admin uyari metni
 *   (h) supurucu yardimcilari — yetim klasor tespiti, acik onay, sayfalama
 *
 * ⚠️ KAPSAM SINIRI: route (delete-tenant) CALISTIRILMAZ — repoda HTTP kosucusu
 *   yok (diger test script'leriyle ayni sinir). Sahte olan yalniz Supabase
 *   client'i; mantik gercek kaynaktan (tenant-storage-purge.mjs) import edilir.
 */

import { readFileSync } from "node:fs";
import {
  DEFAULT_TENANT_ID,
  PURGE_BATCH_SIZE,
  ROUTE_STORAGE_BUDGET_MS,
  isUuid,
  isPurgeableTenantId,
  isTenantOwnedPath,
  listTenantFiles,
  purgeTenantStorage,
  describeStorageLeftover,
  listRootEntries,
  fetchAllTenantIds,
  findOrphanTenantFolders,
  resolveSweepTargets,
} from "../src/lib/super-admin/tenant-storage-purge.mjs";

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

const quiet = () => {}; // purge'un log'unu test ciktisindan uzak tut

// ---------------------------------------------------------------------------
// Sahte Supabase client — storage list/remove + tenants sorgulari
// ---------------------------------------------------------------------------
/**
 * @param {object} o
 * @param {string[]} [o.files]            Bucket'taki tam yollar
 * @param {number} [o.pageCap]            Sunucunun sayfa basina en fazla dondurdugu kayit
 * @param {string[]} [o.tenants]          tenants tablosundaki kimlikler
 * @param {boolean[]} [o.existsSequence]  tenantExists cagrilarina sirayla verilecek cevaplar
 * @param {object|null} [o.tenantCheckError]
 * @param {number|null} [o.removeErrorOnCall]  Kacinci remove cagrisi hata versin (1'den)
 * @param {string[]} [o.undeletable]      remove'un silmedigi yollar
 * @param {{t:number}|null} [o.clock]     Sahte saat (list/remove her cagrida callCost ilerler)
 * @param {number} [o.callCost]
 * @param {Record<string, object[]>} [o.extraEntries]  prefix → ek (tuhaf) kayitlar
 */
function makeFake({
  files = [],
  pageCap = Infinity,
  tenants = [],
  existsSequence = null,
  tenantCheckError = null,
  removeErrorOnCall = null,
  undeletable = [],
  clock = null,
  callCost = 0,
  extraEntries = {},
} = {}) {
  const store = new Map(files.map((p) => [p, 10]));
  const stuck = new Set(undeletable);
  const calls = { list: [], remove: [], tenantChecks: 0, tenantPages: [] };
  const tick = () => {
    if (clock) clock.t += callCost;
  };

  function children(prefix) {
    const map = new Map();
    for (const [path, size] of store) {
      if (prefix !== "" && !path.startsWith(`${prefix}/`)) continue;
      const rest = prefix === "" ? path : path.slice(prefix.length + 1);
      const [head, ...tail] = rest.split("/");
      if (tail.length === 0) map.set(head, { name: head, id: `id:${path}`, metadata: { size } });
      else if (!map.has(head)) map.set(head, { name: head, id: null, metadata: null });
    }
    for (const e of extraEntries[prefix] ?? []) map.set(e.name, e);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  return {
    calls,
    store,
    storage: {
      from(bucket) {
        return {
          async list(prefix, { limit, offset }) {
            tick();
            calls.list.push({ bucket, prefix, limit, offset });
            const page = children(prefix).slice(offset, offset + Math.min(limit, pageCap));
            return { data: page, error: null };
          },
          async remove(paths) {
            tick();
            const n = calls.remove.push({ bucket, paths: [...paths] });
            if (removeErrorOnCall === n) return { data: null, error: { message: "gecici hata" } };
            const removed = [];
            for (const p of paths) {
              if (!stuck.has(p) && store.delete(p)) removed.push({ name: p });
            }
            return { data: removed, error: null };
          },
        };
      },
    },
    from(_table) {
      const st = { eq: null, range: null, count: false };
      const builder = {
        select(_cols, opts = {}) {
          st.count = !!opts.count;
          return builder;
        },
        eq(_col, val) {
          st.eq = val;
          return builder;
        },
        order() {
          return builder;
        },
        range(from, to) {
          st.range = [from, to];
          return builder;
        },
        maybeSingle() {
          calls.tenantChecks++;
          if (tenantCheckError) return Promise.resolve({ data: null, error: tenantCheckError });
          const exists = existsSequence
            ? existsSequence[calls.tenantChecks - 1] ?? existsSequence[existsSequence.length - 1]
            : tenants.includes(st.eq);
          return Promise.resolve({ data: exists ? { id: st.eq } : null, error: null });
        },
        then(resolve, reject) {
          calls.tenantPages.push(st.range);
          const all = [...tenants].sort();
          const [from, to] = st.range ?? [0, all.length - 1];
          const cap = pageCap === Infinity ? 1000 : pageCap;
          const rows = all.slice(from, Math.min(to + 1, from + cap)).map((id) => ({ id }));
          return Promise.resolve({ data: rows, error: null, count: st.count ? all.length : null }).then(
            resolve,
            reject
          );
        },
      };
      return builder;
    },
  };
}

const T = "3f6c2a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f"; // silinen kurum
const OTHER = "7d9e0f12-3456-4789-abcd-ef0123456789"; // yasayan kurum

/** n dosya: T/klasor/dosya-i.jpg */
const filesOf = (tenant, folder, n) =>
  Array.from({ length: n }, (_, i) => `${tenant}/${folder}/dosya-${String(i).padStart(4, "0")}.jpg`);

const removedPaths = (fake) => fake.calls.remove.flatMap((c) => c.paths);

// ---------------------------------------------------------------------------
header("(a) Kimlik guard'lari");

ok("kimlik", "gecerli UUID", isUuid(T), true, T);
ok("kimlik", "buyuk harfli UUID kanonik degil", isUuid(T.toUpperCase()), false, "UPPER");
ok("kimlik", "bos gecersiz", isUuid(""), false, '""');
ok("kimlik", "kurum temizlenebilir", isPurgeableTenantId(T), true, T);
ok("kimlik", "varsayilan kurum ASLA", isPurgeableTenantId(DEFAULT_TENANT_ID), false, "default");
ok("kimlik", "null ASLA", isPurgeableTenantId(null), false, "null");
okTrue(
  "kimlik",
  "DEFAULT_TENANT_ID tohumdaki UUID ile ayni",
  readFileSync("supabase/migrations/001_seed_default.sql", "utf8").includes(`'${DEFAULT_TENANT_ID}'`),
  "001_seed_default.sql"
);
ok("kimlik", "grup boyutu 100", PURGE_BATCH_SIZE, 100, "tasarim");
ok("kimlik", "route sure butcesi 20 sn", ROUTE_STORAGE_BUDGET_MS, 20000, "tasarim");

// ---------------------------------------------------------------------------
header("(b) isTenantOwnedPath — segment karsilastirmasi");

ok("segment", "kendi dosyasi", isTenantOwnedPath(`${T}/news/a.jpg`, T), true, "T/news/a.jpg");
ok("segment", "baska kurum", isTenantOwnedPath(`${OTHER}/news/a.jpg`, T), false, "OTHER/...");
// ⬇ Duz prefix yanilmasi: "T" ile BASLAYAN ama T OLMAYAN klasor
ok("segment", "duz prefix tuzagi (Tx/...)", isTenantOwnedPath(`${T}x/news/a.jpg`, T), false, "Tx/...");
ok("segment", "klasorun kendisi dosya degil", isTenantOwnedPath(T, T), false, "T");
ok("segment", "bos segment", isTenantOwnedPath(`${T}/`, T), false, "T/");
ok("segment", "'..' ile kacis", isTenantOwnedPath(`${T}/../${OTHER}/a.jpg`, T), false, "T/../OTHER");
ok("segment", "'.' segmenti", isTenantOwnedPath(`${T}/./a.jpg`, T), false, "T/./a.jpg");
ok("segment", "bastaki '/'", isTenantOwnedPath(`/${T}/a.jpg`, T), false, "/T/a.jpg");
ok(
  "segment",
  "varsayilan kurumun yolu ASLA",
  isTenantOwnedPath(`${DEFAULT_TENANT_ID}/news/a.jpg`, DEFAULT_TENANT_ID),
  false,
  "default/..."
);

// ---------------------------------------------------------------------------
header("(c) listTenantFiles — ozyinelemeli + sayfali");

{
  const fake = makeFake({
    files: [
      `${T}/news/a.jpg`,
      `${T}/news/gallery/b.jpg`,
      `${T}/gallery/album-1/c.jpg`,
      `${T}/logo.png`,
      `${T}/news/.emptyFolderPlaceholder`,
      `${OTHER}/news/x.jpg`,
      "eski-kok-dosyasi.jpg",
    ],
  });
  const r = await listTenantFiles(fake, T);
  ok(
    "liste",
    "ic ice klasorlerdeki tum dosyalar (+ yer tutucu nesne)",
    r.files.map((f) => f.path).sort(),
    [
      `${T}/gallery/album-1/c.jpg`,
      `${T}/logo.png`,
      `${T}/news/.emptyFolderPlaceholder`,
      `${T}/news/a.jpg`,
      `${T}/news/gallery/b.jpg`,
    ],
    "T agaci"
  );
  ok("liste", "tamamlandi", r.complete, true, "T agaci");
  okTrue(
    "liste",
    "yalniz T altinda listelendi (kok hic listelenmedi)",
    fake.calls.list.every((c) => c.prefix === T || c.prefix.startsWith(`${T}/`)),
    "list prefix'leri"
  );
}

{
  // ⬇ Sunucu sayfa basina ISTENENDEN AZ kayit (7) donduruyor. "az geldi =
  //   bitti" varsayimi olsaydi 7 dosyada durulurdu.
  const fake = makeFake({ files: filesOf(T, "news", 60), pageCap: 7 });
  const r = await listTenantFiles(fake, T);
  ok("liste", "sayfa basina 7 donse de 60 dosyanin hepsi", r.files.length, 60, "pageCap=7");
  const offsets = fake.calls.list.filter((c) => c.prefix === `${T}/news`).map((c) => c.offset);
  // Son dolu sayfa 4 kayit dondu (56-59): offset 56+4 = 60, sonra BOS sayfa.
  ok("liste", "offset donen kadar ilerler, BOS sayfada durur", offsets, [0, 7, 14, 21, 28, 35, 42, 49, 56, 60], "pageCap=7");
}

{
  const fake = makeFake({ files: [`${T}/a.jpg`, `${OTHER}/b.jpg`] });
  const r = await listTenantFiles(fake, "");
  ok("liste", "bos kimlik → HICBIR list cagrisi (kok listelenmez)", fake.calls.list.length, 0, '""');
  ok("liste", "bos kimlik → sonuc bos", r.files.length, 0, '""');
  await listTenantFiles(fake, DEFAULT_TENANT_ID);
  ok("liste", "varsayilan kurum → list cagrisi yok", fake.calls.list.length, 0, "default");
}

{
  const fake = makeFake({
    files: [`${T}/news/a.jpg`],
    extraEntries: {
      [`${T}/news`]: [
        { name: "..", id: null, metadata: null },
        { name: "alt/kacis.jpg", id: "x", metadata: { size: 1 } },
      ],
    },
  });
  const r = await listTenantFiles(fake, T);
  ok("liste", "guvensiz adlar atlandi", r.skipped.sort(), [`${T}/news/..`, `${T}/news/alt/kacis.jpg`], "'..', '/'");
  okTrue("liste", "'..' klasorune dalinmadi", !fake.calls.list.some((c) => c.prefix.includes("..")), "list");
  ok("liste", "gercek dosya yine listelendi", r.files.map((f) => f.path), [`${T}/news/a.jpg`], "a.jpg");
}

// ---------------------------------------------------------------------------
header("(d) purgeTenantStorage guard'lari — hicbir sey silinmemeli");

{
  // ⬇ Kurum hala kayitli: listelemeye bile girilmez, remove HIC cagrilmaz.
  const fake = makeFake({ files: filesOf(T, "news", 5), tenants: [T] });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("guard", "kurum varsa → refused/tenant-exists", [r.status, r.reason], ["refused", "tenant-exists"], "tenants=[T]");
  ok("guard", "kurum varsa → list cagrisi yok", fake.calls.list.length, 0, "tenants=[T]");
  ok("guard", "kurum varsa → remove cagrisi yok", fake.calls.remove.length, 0, "tenants=[T]");
  ok("guard", "kurum varsa → dosyalar yerinde", fake.store.size, 5, "tenants=[T]");
}

{
  // ⬇ Silmeden HEMEN ONCEKI ikinci kontrol: listeleme sirasinda kurum
  //   "yeniden gorunurse" (ornegin bir hata sonucu) yine hicbir sey silinmez.
  const fake = makeFake({ files: filesOf(T, "news", 5), existsSequence: [false, true] });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("guard", "ikinci kontrol kurumu gorurse → refused", [r.status, r.reason], ["refused", "tenant-exists"], "[false,true]");
  ok("guard", "ikinci kontrol → iki kez soruldu", fake.calls.tenantChecks, 2, "[false,true]");
  ok("guard", "ikinci kontrol → remove cagrisi yok", fake.calls.remove.length, 0, "[false,true]");
}

{
  const fake = makeFake({ files: filesOf(T, "news", 5), tenantCheckError: { message: "db down" } });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("guard", "kurum kontrolu hata → refused (fail-closed)", [r.status, r.reason], ["refused", "tenant-check-failed"], "db down");
  ok("guard", "kontrol hatasi → remove cagrisi yok", fake.calls.remove.length, 0, "db down");
}

{
  const fake = makeFake({ files: filesOf(DEFAULT_TENANT_ID, "news", 5) });
  const r = await purgeTenantStorage(fake, DEFAULT_TENANT_ID, { log: quiet });
  ok("guard", "varsayilan kurum → refused/default-tenant", [r.status, r.reason], ["refused", "default-tenant"], "default");
  ok(
    "guard",
    "varsayilan kurum → DB/list/remove cagrisi yok",
    [fake.calls.tenantChecks, fake.calls.list.length, fake.calls.remove.length],
    [0, 0, 0],
    "default"
  );
}

for (const bad of ["", T.toUpperCase(), `${T}/`, "../x"]) {
  const fake = makeFake({ files: [`${T}/a.jpg`, `${OTHER}/b.jpg`] });
  const r = await purgeTenantStorage(fake, bad, { log: quiet });
  ok(
    "guard",
    `gecersiz kimlik (${JSON.stringify(bad)}) → hicbir cagri yok`,
    [r.reason, fake.calls.list.length, fake.calls.remove.length],
    ["invalid-tenant-id", 0, 0],
    bad
  );
}

// ---------------------------------------------------------------------------
header("(e) .remove() argumanlari — yalniz o kurum, 100'luk gruplar");

{
  const tFiles = [...filesOf(T, "news", 120), ...filesOf(T, "gallery/album-1", 80), ...filesOf(T, "sliders", 50)];
  const fake = makeFake({
    files: [...tFiles, ...filesOf(OTHER, "news", 20), "eski-kok-dosyasi.jpg"],
    tenants: [OTHER],
  });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("remove", "sonuc done, 250 silindi", [r.status, r.removed, r.remaining], ["done", 250, 0], "250 dosya");
  ok("remove", "gruplar 100 / 100 / 50", fake.calls.remove.map((c) => c.paths.length), [100, 100, 50], "250 dosya");
  okTrue(
    "remove",
    "remove'a giden HER yol T'ye ait (segment)",
    removedPaths(fake).every((p) => isTenantOwnedPath(p, T)),
    "tum argumanlar"
  );
  ok("remove", "remove'a giden yollar = T'nin dosyalari", removedPaths(fake).sort(), [...tFiles].sort(), "birebir");
  okTrue(
    "remove",
    "yasayan kurumun 20 dosyasi yerinde",
    filesOf(OTHER, "news", 20).every((p) => fake.store.has(p)),
    "OTHER"
  );
  okTrue("remove", "kok dosyasi yerinde", fake.store.has("eski-kok-dosyasi.jpg"), "kok");
  okTrue("remove", "yalniz 'images' bucket'i", fake.calls.remove.every((c) => c.bucket === "images"), "bucket");
}

{
  // Sayfalama + silme birlikte: sunucu 7'ser dondurse de hepsi silinir.
  const fake = makeFake({ files: filesOf(T, "news", 250), pageCap: 7 });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("remove", "pageCap=7 iken de 250'nin hepsi silindi", [r.status, r.removed], ["done", 250], "pageCap=7");
}

{
  const fake = makeFake({ files: [] });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("remove", "dosyasi olmayan kurum → done, remove yok", [r.status, fake.calls.remove.length], ["done", 0], "bos");
}

// ---------------------------------------------------------------------------
header("(f) Kismi sonuclar");

{
  // Sure butcesi: her list/remove cagrisi 3 sn. 250 dosya tek klasorde:
  // kurum koku 2 list (news + bos) + news 4 list (100/100/50/bos) = 18 sn;
  // 1. grup silinir (21 sn), 2. grup oncesi butce (20 sn) dolmus.
  const clock = { t: 0 };
  const fake = makeFake({ files: filesOf(T, "news", 250), clock, callCost: 3000 });
  const r = await purgeTenantStorage(fake, T, { budgetMs: 20000, now: () => clock.t, log: quiet });
  ok(
    "kismi",
    "butce dolunca durur: 100 silindi, 150 kaldi",
    [r.status, r.removed, r.remaining, r.timedOut, r.listingComplete],
    ["partial", 100, 150, true, true],
    "3 sn/cagri"
  );
  ok("kismi", "butce sonrasi remove cagrilmadi", fake.calls.remove.length, 1, "3 sn/cagri");
  ok("kismi", "uyari metni", describeStorageLeftover(r), "150 dosya depolamada kaldı (süre sınırı)", "metin");
}

{
  // Listeleme de bitmeden butce doldu → "en az": kok 2 list (16 sn), news'in
  // ilk sayfasi (24 sn) — o ana dek yalniz 100 dosya biliniyor.
  const clock = { t: 0 };
  const fake = makeFake({ files: filesOf(T, "news", 250), clock, callCost: 8000 });
  const r = await purgeTenantStorage(fake, T, { budgetMs: 20000, now: () => clock.t, log: quiet });
  ok("kismi", "listeleme eksik → listingComplete=false", [r.listingComplete, r.timedOut, r.removed], [false, true, 0], "8 sn/cagri");
  ok("kismi", "uyari 'en az'", describeStorageLeftover(r), "en az 100 dosya depolamada kaldı (süre sınırı)", "metin");
}

{
  const fake = makeFake({ files: filesOf(T, "news", 250), removeErrorOnCall: 2 });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok(
    "kismi",
    "2. grup hata → digerleri yine denenir (150 silindi, 100 kaldi)",
    [r.status, r.removed, r.remaining, fake.calls.remove.length],
    ["partial", 150, 100, 3],
    "remove#2 hata"
  );
  ok("kismi", "hata metni kaydedildi", r.error, "remove: gecici hata", "remove#2 hata");
}

{
  const stuck = filesOf(T, "news", 5);
  const fake = makeFake({ files: [...stuck, ...filesOf(T, "gallery", 20)], undeletable: stuck });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("kismi", "silinemeyen 5 dosya kalan sayilir", [r.status, r.removed, r.remaining], ["partial", 20, 5], "undeletable");
}

{
  const fake = makeFake({
    files: [`${T}/news/a.jpg`],
    extraEntries: { [`${T}/news`]: [{ name: "..", id: null, metadata: null }] },
  });
  const r = await purgeTenantStorage(fake, T, { log: quiet });
  ok("kismi", "guvensiz ad → atlandi, silinmedi, partial", [r.status, r.removed, r.skippedForeign], ["partial", 1, 1], "'..'");
  okTrue("kismi", "'..' yolu remove'a GITMEDI", !removedPaths(fake).some((p) => p.includes("..")), "'..'");
}

// ---------------------------------------------------------------------------
header("(g) describeStorageLeftover");

ok("metin", "tam → null", describeStorageLeftover({ status: "done" }), null, "done");
ok("metin", "sonuc yok → null", describeStorageLeftover(undefined), null, "undefined");
ok(
  "metin",
  "kurum kontrolu yapilamadi",
  describeStorageLeftover({ status: "refused", reason: "tenant-check-failed" }),
  "dosyalar silinmedi (kurum kontrolü yapılamadı)",
  "refused"
);
ok(
  "metin",
  "atlanan yol sayiya dahil",
  describeStorageLeftover({
    status: "partial",
    remaining: 0,
    skippedForeign: 2,
    listingComplete: true,
    timedOut: false,
    error: null,
  }),
  "2 dosya depolamada kaldı (güvenlik kontrolünü geçemeyen yol)",
  "skipped=2"
);

// ---------------------------------------------------------------------------
header("(h) Supurucu yardimcilari");

{
  const UPPER = OTHER.toUpperCase();
  const root = [
    { name: T, id: null },
    { name: OTHER, id: null },
    { name: DEFAULT_TENANT_ID, id: null },
    { name: "eski-dosyalar", id: null },
    { name: UPPER, id: null },
    { name: "logo.png", id: "f1", metadata: { size: 5 } },
  ];
  ok(
    "supurucu",
    "yalniz kaydi olmayan UUID klasoru yetim; tanimayanlar ayri",
    findOrphanTenantFolders(root, [OTHER]),
    { orphans: [T], unknown: [DEFAULT_TENANT_ID, UPPER, "eski-dosyalar", "logo.png"].sort() },
    "kok"
  );
}

{
  const { accepted, rejected } = resolveSweepTargets([T, OTHER, DEFAULT_TENANT_ID, "abc", T], [T]);
  ok("supurucu", "acik onay: yalniz bu kosumdaki yetim kabul", accepted, [T], "requested");
  ok(
    "supurucu",
    "retler gerekceli",
    rejected.map((r) => r.id),
    [OTHER, DEFAULT_TENANT_ID, "abc"],
    "requested"
  );
}

{
  const folders = Array.from({ length: 10 }, (_, i) => `klasor-${i}/a.jpg`);
  const fake = makeFake({ files: folders, pageCap: 3 });
  const entries = await listRootEntries(fake);
  ok("supurucu", "kok listesi sayfali (3'er) → 10 klasor", entries.length, 10, "pageCap=3");
}

{
  const ids = Array.from({ length: 2500 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const r1 = await fetchAllTenantIds(makeFake({ tenants: ids }));
  ok("supurucu", "2500 kurumun hepsi (Max rows 1000)", r1.length, 2500, "maxRows=1000");
  const r2 = await fetchAllTenantIds(makeFake({ tenants: ids, pageCap: 400 }));
  ok("supurucu", "sunucu 400'er dondurse de hepsi", r2.length, 2500, "maxRows=400");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
