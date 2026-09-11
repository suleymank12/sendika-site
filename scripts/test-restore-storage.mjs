/**
 * Storage geri yükleme testi — 11 Eylül 2026 (NOTE.md "YEDEKTEN GERİ YÜKLEME").
 *
 * CALISTIRMA:
 *   npm run test:restore
 *   (= node scripts/test-restore-storage.mjs)
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) hedef guard'i — env ref'i --hedef ile uyusmazsa DUR; process.env yok
 *       sayilir; .env/.env.local kendiliginden okunmaz (CLI ile de)
 *   (b) argumanlar — --env/--hedef zorunlu, --onek UUID, tarih bicimi
 *   (c) ayna taramasi — _silinenler/, yedek.log, .part, nokta dosyalari haric
 *   (d) kaynak secimi — --onek, --silinenler-dahil (en yeni tarih, ayna kazanir)
 *   (e) hedef listeleme — sunucu kisa sayfa donse de YALNIZ bos sayfada durur
 *   (f) plan — ayni boyut atla, farkli boyut CAKISMA, eksik yukle
 *   (g) yukleme cevabi siniflama + yeniden deneme
 *   (h) butun akis — mevcut dosya EZILMEZ (yukleyiciye hic gitmez), tek hata
 *       digerlerini durdurmaz, boyut siniri ayri, son dogrulama, cikis kodu
 *
 * ⚠️ KAPSAM SINIRI: gercek Supabase'e yukleme yok (sahte yukleyici). Canli
 *   davranis: NOTE.md tatbikat tablosu.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  LIST_MAX_PAGES,
  UsageError,
  classifyUpload,
  compareAfter,
  encodeStoragePath,
  isExcludedName,
  listRemoteFiles,
  mimeFromPath,
  parseArgs,
  planRestore,
  restoreExitCode,
  runPool,
  runRestore,
  selectSources,
  uploadWithRetry,
  walkMirror,
} from "./lib/storage-restore.mjs";
import { TargetError, parseEnvText, refFromSupabaseUrl, resolveTarget } from "./lib/target-env.mjs";

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

async function okThrows(group, name, fn, ErrorType, includes, input) {
  try {
    await fn();
    ok(group, name, "firlatmadi", `${ErrorType.name}: ${includes}`, input);
  } catch (err) {
    ok(group, name, err instanceof ErrorType && String(err.message).includes(includes), true, `${err?.name}: ${err?.message}`);
  }
}

function header(title) {
  console.log("");
  console.log(title);
  console.log("");
}

// ---------------------------------------------------------------------------
// Fikstürler
// ---------------------------------------------------------------------------
const TEST_REF = "aaaaaaaaaaaaaaaaaaaa";
const LIVE_REF = "jqwmnawzehyvpwrtdvku";
const T1 = "00000000-0000-0000-0000-000000000001";
const T2 = "11111111-2222-4333-8444-555555555555";
const envText = (ref, extra = "") =>
  `# test\nNEXT_PUBLIC_SUPABASE_URL="https://${ref}.supabase.co"\nexport SUPABASE_SERVICE_ROLE_KEY='sahte-anahtar'\n${extra}`;

/** Ic ice nesne agaci: dosya = boyut (sayi), klasor = nesne. */
function fakeFs(root, tree) {
  const lookup = (p) => {
    const rel = p === root ? "" : p.slice(root.length + 1);
    let node = tree;
    for (const seg of rel ? rel.split("/") : []) {
      node = node?.[seg];
      if (node === undefined) throw Object.assign(new Error(`yok: ${p}`), { code: "ENOENT" });
    }
    return node;
  };
  return {
    async readdir(dir) {
      const node = lookup(dir);
      return Object.entries(node).map(([name, v]) => ({
        name,
        isDirectory: typeof v === "object" && v !== null && !v.symlink,
        isFile: typeof v === "number",
      }));
    },
    async size(file) {
      return lookup(file);
    },
  };
}

const ROOT = "/yedek";
const TREE = {
  [T1]: { news: { "a.webp": 100, "b.webp": 200 }, logo: { "logo.png": 50 } },
  [T2]: { gallery: { "c.jpg": 300 } },
  "kok-dosya.png": 10,
  "yedek.log": 5,
  ".emptyFolderPlaceholder": 0,
  "yarim.webp.part": 7,
  bag: { symlink: true },
  _silinenler: {
    "2026-09-01": { [T1]: { news: { "eski.webp": 400, "a.webp": 111 } } },
    "2026-09-05": { [T1]: { news: { "eski.webp": 444, "yeni-silinen.webp": 555 } } },
    "tarih-degil": { x: 1 },
  },
};

// ---------------------------------------------------------------------------
header("(a) Hedef guard'i");

ok("guard", "dogru ref → hedef cozulur", resolveTarget(envText(TEST_REF), TEST_REF, "t.env"), { url: `https://${TEST_REF}.supabase.co`, serviceKey: "sahte-anahtar", ref: TEST_REF }, "ok");
await okThrows("guard", "ref uyusmazsa DUR", () => resolveTarget(envText(LIVE_REF), TEST_REF, "t.env"), TargetError, "HEDEF UYUŞMUYOR", "canli env + test ref");
await okThrows("guard", "service key yoksa DUR", () => resolveTarget(`NEXT_PUBLIC_SUPABASE_URL=https://${TEST_REF}.supabase.co`, TEST_REF, "t.env"), TargetError, "SUPABASE_SERVICE_ROLE_KEY yok", "anahtarsiz");
await okThrows("guard", "http adresi reddedilir", () => resolveTarget(envText(TEST_REF).replace("https://", "http://"), TEST_REF, "t.env"), TargetError, "Supabase proje adresi değil", "http");
await okThrows("guard", "ozel alan adi reddedilir (ref dogrulanamaz)", () => resolveTarget("NEXT_PUBLIC_SUPABASE_URL=https://db.ornek.com\nSUPABASE_SERVICE_ROLE_KEY=k", TEST_REF, "t.env"), TargetError, "Supabase proje adresi değil", "custom");
await okThrows("guard", "gecersiz beklenen ref", () => resolveTarget(envText(TEST_REF), "KISA", "t.env"), TargetError, "Geçersiz proje ref", "KISA");
{
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${LIVE_REF}.supabase.co`;
  const t = resolveTarget(envText(TEST_REF), TEST_REF, "t.env");
  if (saved === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  ok("guard", "process.env'deki canli URL YOK SAYILIR (yalniz dosya)", t.ref, TEST_REF, "process.env canli");
}
ok("guard", "env ayristirma: yorum, tirnak, export", parseEnvText(envText(TEST_REF)), { NEXT_PUBLIC_SUPABASE_URL: `https://${TEST_REF}.supabase.co`, SUPABASE_SERVICE_ROLE_KEY: "sahte-anahtar" }, "env");
ok("guard", "ref cikarma", [refFromSupabaseUrl(`https://${LIVE_REF}.supabase.co/`), refFromSupabaseUrl("https://x.supabase.co"), refFromSupabaseUrl("bozuk")], [LIVE_REF, null, null], "refs");

{
  // CLI: ref uyusmazsa ag cagrisi YAPILMADAN cikis 2
  const dir = mkdtempSync(join(tmpdir(), "restore-test-"));
  const envFile = join(dir, "hedef.env");
  writeFileSync(envFile, envText(LIVE_REF));
  const run = (args) => spawnSync(process.execPath, ["scripts/restore-storage.mjs", ...args], { encoding: "utf8" });
  const mismatch = run(["--env", envFile, "--hedef", TEST_REF]);
  ok("cli", "ref uyusmazsa cikis 2 + mesaj", [mismatch.status, mismatch.stderr.includes("HEDEF UYUŞMUYOR")], [2, true], mismatch.stderr.trim());
  const noEnv = run(["--hedef", TEST_REF]);
  ok("cli", "--env yoksa .env.local OKUNMAZ, cikis 2", [noEnv.status, noEnv.stderr.includes("--env <dosya> zorunlu")], [2, true], noEnv.stderr.trim());
  const missing = run(["--env", join(dir, "yok.env"), "--hedef", TEST_REF]);
  ok("cli", "env dosyasi yoksa cikis 2", [missing.status, missing.stderr.includes("env dosyası okunamadı")], [2, true], missing.stderr.trim());
  rmSync(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
header("(b) Argumanlar");

ok("arg", "varsayilanlar", parseArgs(["--env", "t.env", "--hedef", TEST_REF]), { env: "t.env", hedef: TEST_REF, kaynak: "/var/backups/storage", yukle: false, onek: null, silinenlerDahil: null }, "min");
ok("arg", "tum secenekler", parseArgs(["--env", "t.env", "--hedef", TEST_REF, "--kaynak", "/y", "--yukle", "--onek", T1, "--silinenler-dahil", "2026-09-05"]), { env: "t.env", hedef: TEST_REF, kaynak: "/y", yukle: true, onek: T1, silinenlerDahil: "2026-09-05" }, "tam");
await okThrows("arg", "--hedef zorunlu", () => parseArgs(["--env", "t.env"]), UsageError, "--hedef", "hedefsiz");
await okThrows("arg", "--onek UUID olmali", () => parseArgs(["--env", "t", "--hedef", TEST_REF, "--onek", "egitim-sen"]), UsageError, "UUID", "slug");
await okThrows("arg", "gecersiz tarih (30 Subat)", () => parseArgs(["--env", "t", "--hedef", TEST_REF, "--silinenler-dahil", "2026-02-30"]), UsageError, "YYYY-AA-GG", "30 subat");
await okThrows("arg", "bilinmeyen secenek", () => parseArgs(["--env", "t", "--hedef", TEST_REF, "--uzerine-yaz"]), UsageError, "Bilinmeyen", "--uzerine-yaz");
await okThrows("arg", "degersiz secenek", () => parseArgs(["--env", "--hedef", TEST_REF]), UsageError, "değer gerekli", "--env --hedef");

// ---------------------------------------------------------------------------
header("(c) Ayna taramasi");

const scan = await walkMirror(fakeFs(ROOT, TREE), ROOT);
ok("ayna", "canli dosyalar (yol + boyut)", scan.live.map((f) => [f.path, f.size]), [[`${T1}/logo/logo.png`, 50], [`${T1}/news/a.webp`, 100], [`${T1}/news/b.webp`, 200], [`${T2}/gallery/c.jpg`, 300], ["kok-dosya.png", 10]].sort((a, b) => (a[0] < b[0] ? -1 : 1)), "live");
ok("ayna", "yerel yol kaynak dizinine gore", scan.live.find((f) => f.path === `${T1}/news/a.webp`).localPath, `${ROOT}/${T1}/news/a.webp`, "localPath");
ok("ayna", "silinenler orijinal yolu + tarihiyle", scan.deleted.map((d) => [d.date, d.path, d.size]), [["2026-09-01", `${T1}/news/a.webp`, 111], ["2026-09-01", `${T1}/news/eski.webp`, 400], ["2026-09-05", `${T1}/news/eski.webp`, 444], ["2026-09-05", `${T1}/news/yeni-silinen.webp`, 555]], "deleted");
okTrue("ayna", "haric: yedek.log, .part, nokta dosyasi, symlink, tarih olmayan klasor", ["yedek.log", "yarim.webp.part", ".emptyFolderPlaceholder", "bag", "_silinenler/tarih-degil"].every((x) => scan.excluded.includes(x)), JSON.stringify(scan.excluded));
okTrue("ayna", "_silinenler canli kumeye KARISMAZ", scan.live.every((f) => !f.path.startsWith("_silinenler")), "live");
ok("ayna", "isExcludedName", ["yedek.log", "a.part", ".x", "a.webp"].map(isExcludedName), [true, true, true, false], "names");

// ---------------------------------------------------------------------------
header("(d) Kaynak secimi");

ok("secim", "varsayilan: yalniz canli ayna", selectSources(scan).map((s) => s.path).length, 5, "default");
ok("secim", "--onek: yalniz o kurum", selectSources(scan, { onek: T2 }).map((s) => s.path), [`${T2}/gallery/c.jpg`], "onek");
{
  const s = selectSources(scan, { onek: T1, silinenlerDahil: "2026-09-01" });
  const byPath = Object.fromEntries(s.map((x) => [x.path, [x.source, x.size]]));
  ok("secim", "ayni yol birden cok gunde silinmis → EN YENI", byPath[`${T1}/news/eski.webp`], ["_silinenler/2026-09-05", 444], "eski.webp");
  ok("secim", "aynada da varsa AYNA kazanir", byPath[`${T1}/news/a.webp`], ["ayna", 100], "a.webp");
  ok("secim", "tarih sonrasi silinen eklenir", byPath[`${T1}/news/yeni-silinen.webp`], ["_silinenler/2026-09-05", 555], "yeni");
}
ok("secim", "tarihten ONCE silinen alinmaz", selectSources(scan, { silinenlerDahil: "2026-09-02" }).find((s) => s.path === `${T1}/news/eski.webp`)?.size, 444, ">= 2026-09-02");
ok("secim", "tarih sonrasinda silinen yoksa hicbiri", selectSources(scan, { silinenlerDahil: "2026-09-06" }).length, 5, ">= 2026-09-06");

// ---------------------------------------------------------------------------
header("(e) Hedef listeleme");

/** Sahte bucket: sunucu `cap`ten fazla vermez (istenen limit ne olursa olsun). */
function fakeBucket(files, cap) {
  const calls = [];
  return {
    calls,
    listPage: async (prefix, offset, limit) => {
      calls.push([prefix, offset, limit]);
      const base = prefix ? `${prefix}/` : "";
      const names = new Map();
      for (const [path, size] of Object.entries(files)) {
        if (!path.startsWith(base)) continue;
        const rest = path.slice(base.length);
        const [head, ...tail] = rest.split("/");
        if (tail.length > 0) names.set(head, { name: head, id: null, metadata: null });
        else names.set(head, { name: head, id: `id-${path}`, metadata: { size } });
      }
      const sorted = Array.from(names.values()).sort((a, b) => (a.name < b.name ? -1 : 1));
      return sorted.slice(offset, offset + Math.min(limit, cap));
    },
  };
}
{
  const files = {};
  for (let i = 0; i < 25; i++) files[`${T1}/news/${String(i).padStart(2, "0")}.webp`] = 1000 + i;
  files[`${T2}/gallery/c.jpg`] = 300;
  files["kok.png"] = 9;
  const b = fakeBucket(files, 7);
  const remote = await listRemoteFiles(b.listPage, "", 100);
  ok("liste", "sunucu 7'lik sayfa donse de 27 dosyanin HEPSI", remote.size, 27, `cap=7 limit=100`);
  ok("liste", "boyutlar metadata'dan", [remote.get(`${T1}/news/24.webp`), remote.get("kok.png")], [1024, 9], "size");
  okTrue("liste", "yalniz BOS sayfada durdu (klasor basina son cagri bos)", b.calls.filter(([p]) => p === `${T1}/news`).length === 5, JSON.stringify(b.calls.filter(([p]) => p === `${T1}/news`)));
  const scoped = await listRemoteFiles(fakeBucket(files, 100).listPage, T2);
  ok("liste", "onek ile yalniz o klasor", Array.from(scoped.keys()), [`${T2}/gallery/c.jpg`], "scoped");
  const noSize = await listRemoteFiles(async (p, off) => (off === 0 && !p ? [{ name: "x.webp", id: "1", metadata: {} }] : []));
  ok("liste", "boyutu olmayan dosya → null", noSize.get("x.webp"), null, "metadata {}");
  await okThrows("liste", "offset'i yok sayan sunucu → sonsuz dongu yerine hata", () => listRemoteFiles(async () => [{ name: "ayni", id: "1", metadata: { size: 1 } }]), Error, `${LIST_MAX_PAGES} sayfa`, "sonsuz");
}

// ---------------------------------------------------------------------------
header("(f) Plan");

{
  const sources = [
    { path: "a", size: 10, localPath: "/y/a", source: "ayna" },
    { path: "b", size: 20, localPath: "/y/b", source: "ayna" },
    { path: "c", size: 30, localPath: "/y/c", source: "ayna" },
    { path: "d", size: 40, localPath: "/y/d", source: "ayna" },
  ];
  const plan = planRestore(sources, new Map([["a", 10], ["b", 99], ["c", null]]));
  ok("plan", "ayni boyut → atla", plan.skip.map((s) => s.path), ["a"], "a");
  ok("plan", "farkli boyut → CAKISMA (yuklenmez)", plan.conflict.map((s) => [s.path, s.remoteSize]), [["b", 99], ["c", null]], "b,c");
  ok("plan", "eksik → yukle", plan.upload.map((s) => s.path), ["d"], "d");
}

// ---------------------------------------------------------------------------
header("(g) Yukleme cevabi + yeniden deneme");

for (const [res, want, label] of [
  [{ status: 200 }, "ok", "200"],
  [{ status: 409 }, "exists", "409"],
  [{ status: 400, bodyText: '{"statusCode":"409","error":"Duplicate","message":"The resource already exists"}' }, "exists", "400 + Duplicate (eski surum)"],
  [{ status: 413 }, "too-large", "413"],
  [{ status: 400, bodyText: '{"statusCode":"413","error":"Payload too large","message":"The object exceeded the maximum allowed size"}' }, "too-large", "400 + boyut (eski surum)"],
  [{ status: 500 }, "retry", "500"],
  [{ status: 503 }, "retry", "503"],
  [{ status: 429 }, "retry", "429"],
  [{ status: 403, bodyText: '{"error":"Unauthorized"}' }, "error", "403"],
  [{ status: 400, bodyText: "bozuk govde" }, "error", "400 bozuk"],
]) {
  ok("cevap", label, classifyUpload(res), want, JSON.stringify(res));
}
{
  const noSleep = async () => {};
  const seq = (list) => {
    let i = 0;
    return async () => {
      const v = list[Math.min(i++, list.length - 1)];
      if (v instanceof Error) throw v;
      return v;
    };
  };
  const item = { path: "x", size: 1, localPath: "/x", source: "ayna" };
  ok("deneme", "500, 500, 200 → ok (3. deneme)", await uploadWithRetry(seq([{ status: 500 }, { status: 500 }, { status: 200 }]), item, { sleep: noSleep }), { kind: "ok", attempts: 3, detail: "" }, "500,500,200");
  const three = await uploadWithRetry(seq([{ status: 502 }]), item, { sleep: noSleep });
  ok("deneme", "hep 502 → 3 denemeden sonra hata", [three.kind, three.attempts], ["error", 3], JSON.stringify(three));
  let calls = 0;
  const dup = await uploadWithRetry(async () => (calls++, { status: 409 }), item, { sleep: noSleep });
  ok("deneme", "409 yeniden DENENMEZ", [dup.kind, calls], ["exists", 1], "409");
  ok("deneme", "ag hatasi → sonra ok", (await uploadWithRetry(seq([Object.assign(new Error("x"), { code: "ECONNRESET" }), { status: 200 }]), item, { sleep: noSleep })).kind, "ok", "ECONNRESET,200");
  const slept = [];
  await uploadWithRetry(seq([{ status: 500 }]), item, { sleep: async (ms) => slept.push(ms) });
  ok("deneme", "denemeler arasi bekleme artar", slept, [1000, 3000], "sleep");
}

// ---------------------------------------------------------------------------
header("(h) Butun akis");

{
  const sources = selectSources(scan);
  const remoteBefore = new Map([
    [`${T1}/news/a.webp`, 100], // ayni boyut → atla
    [`${T1}/news/b.webp`, 999], // farkli boyut → CAKISMA
  ]);
  const uploaded = [];
  const fakeUpload = async (item) => {
    uploaded.push(item.path);
    if (item.path === `${T2}/gallery/c.jpg`) return { status: 413 };
    if (item.path === "kok-dosya.png") return { status: 403, bodyText: "yasak" };
    return { status: 200 };
  };

  const report0 = await runRestore({ sources, remoteBefore, write: false, upload: fakeUpload, relist: async () => new Map() });
  ok("akis", "RAPOR modunda yukleyici HIC cagrilmaz", uploaded.length, 0, "rapor");
  ok("akis", "RAPOR: plan sayilari (yukle/atla/cakisma)", [report0.plan.upload.length, report0.plan.skip.length, report0.plan.conflict.length], [3, 1, 1], "plan");
  ok("akis", "RAPOR + cakisma → cikis 1", restoreExitCode(report0), 1, "conflict");

  const after = new Map([...remoteBefore, [`${T1}/logo/logo.png`, 50]]);
  const report = await runRestore({ sources, remoteBefore, write: true, upload: fakeUpload, relist: async () => after, concurrency: 2, sleep: async () => {} });
  okTrue("akis", "MEVCUT dosya (ayni boyut) yukleyiciye HIC gitmez", !uploaded.includes(`${T1}/news/a.webp`), JSON.stringify(uploaded));
  okTrue("akis", "CAKISAN dosya yukleyiciye HIC gitmez (ezilmez)", !uploaded.includes(`${T1}/news/b.webp`), JSON.stringify(uploaded));
  ok("akis", "tek hata digerlerini durdurmaz", report.uploaded.map((f) => f.path), [`${T1}/logo/logo.png`], "uploaded");
  ok("akis", "boyut siniri ayri sayilir", report.tooLarge.map((f) => f.path), [`${T2}/gallery/c.jpg`], "tooLarge");
  ok("akis", "hata ayri sayilir", report.errors.map((f) => f.path), ["kok-dosya.png"], "errors");
  ok("akis", "son dogrulama: eksikler ve boyut farki", [report.verify.missing.sort(), report.verify.sizeMismatch.map((m) => m.path)], [[`${T2}/gallery/c.jpg`, "kok-dosya.png"], [`${T1}/news/b.webp`]], "verify");
  ok("akis", "hata/cakisma → cikis 1", restoreExitCode(report), 1, "exit");

  const clean = selectSources(scan, { onek: T2 });
  const cleanReport = await runRestore({ sources: clean, remoteBefore: new Map(), write: true, upload: async () => ({ status: 200 }), relist: async () => new Map([[`${T2}/gallery/c.jpg`, 300], ["baska/x.png", 1]]) });
  ok("akis", "temiz koşum → cikis 0; hedefteki fazlalik yalniz bilgi", [restoreExitCode(cleanReport), cleanReport.verify.extra], [0, ["baska/x.png"]], "clean");
  const second = await runRestore({ sources: clean, remoteBefore: new Map([[`${T2}/gallery/c.jpg`, 300]]), write: true, upload: async () => { throw new Error("cagrilmamali"); }, relist: async () => new Map([[`${T2}/gallery/c.jpg`, 300]]) });
  ok("akis", "ikinci kosum: 0 yukleme, hepsi atlandi (tekrar kosulabilir)", [second.plan.upload.length, second.plan.skip.length, restoreExitCode(second)], [0, 1, 0], "rerun");
}
{
  let active = 0;
  let peak = 0;
  await runPool(Array.from({ length: 10 }, (_, i) => i), 4, async () => {
    active++;
    peak = Math.max(peak, active);
    await new Promise((r) => setTimeout(r, 5));
    active--;
  });
  ok("havuz", "en fazla 4 paralel", peak, 4, "peak");
}
ok("yardimci", "icerik tipi uzantidan", ["a/b.WEBP", "x.jpeg", "v.mp4", "adsiz", ".gizli"].map(mimeFromPath), ["image/webp", "image/jpeg", "video/mp4", "application/octet-stream", "application/octet-stream"], "mime");
ok("yardimci", "yol kodlama (/ korunur)", encodeStoragePath(`${T1}/news/a b#1.webp`), `${T1}/news/a%20b%231.webp`, "encode");
ok("yardimci", "compareAfter bos", compareAfter([], new Map()), { missing: [], sizeMismatch: [], extra: [] }, "empty");

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
