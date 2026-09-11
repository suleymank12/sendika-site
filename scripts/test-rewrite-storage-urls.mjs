/**
 * Storage URL donusumu testi — 11 Eylul 2026 (NOTE.md "YEDEKTEN GERI YUKLEME").
 *
 * CALISTIRMA:
 *   npm run test:rewrite-urls
 *   (= node scripts/test-rewrite-storage-urls.mjs)
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) rewriteValue — HTML ICINDEKI adresler (img src, a href, birden cok),
 *       jsonb ic ice, dizi; baska host ve storage-disi eski ref DEGISMEZ
 *   (b) countMentions — donusmeyen eski ref gecisleri sayilir
 *   (c) textColumnsFromOpenApi — canlidaki yapidan fikstur: metin + jsonb,
 *       PK'siz / bilesik PK atlanir ve raporlanir
 *   (d) runRewrite — RAPOR yazmaz; --yaz yalniz degisen kolonlari PK ile
 *       gunceller; sunucu kisa sayfa donse de TUM satirlar; hata raporu
 *   (e) guard — env ref'i --yeni ile ayni olmali (CLI: cikis 2)
 *
 * Canli olcum (11 Eylul, RAPOR modu, yazma yok): 20 tablo, 9 kolonda 28
 * satirda 30 adres (news.content HTML'i ve site_settings.value dahil),
 * dokunulmayan gecis 0.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  countMentions,
  rewriteExitCode,
  rewriteValue,
  runRewrite,
  storagePrefix,
  textColumnsFromOpenApi,
  totals,
} from "./lib/storage-url-rewrite.mjs";
import { TargetError, resolveTarget } from "./lib/target-env.mjs";

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

function header(title) {
  console.log("");
  console.log(title);
  console.log("");
}

// ---------------------------------------------------------------------------
const ESKI = "jqwmnawzehyvpwrtdvku";
const YENI = "bbbbbbbbbbbbbbbbbbbb";
const FROM = storagePrefix(ESKI);
const TO = storagePrefix(YENI);
const IMG = (ref, p) => `https://${ref}.supabase.co/storage/v1/object/public/images/${p}`;

// ---------------------------------------------------------------------------
header("(a) rewriteValue + (b) countMentions");

ok("onek", "yalniz storage oneki", FROM, `https://${ESKI}.supabase.co/storage/v1/`, "prefix");
{
  const html =
    `<p>Giris</p><img src="${IMG(ESKI, "t/news/a.webp")}" alt="a">` +
    `<p><a href="${IMG(ESKI, "t/news/b.pdf")}">belge</a></p>` +
    `<img src="${IMG(ESKI, "t/news/c.webp")}">`;
  const r = rewriteValue(html, FROM, TO);
  ok("html", "HTML icindeki 3 adres (img src + a href) donusur", r.count, 3, "html");
  ok("html", "donusen HTML'de eski ref kalmaz, yapi korunur", r.value, html.split(FROM).join(TO), "html");
  ok("html", "HTML'de eski ref sayaci 0", countMentions(r.value, ESKI), 0, "leftover");
}
{
  const s = `![x](${IMG(ESKI, "a.png")}) ve ${IMG(ESKI, "b.png")}?width=300`;
  ok("metin", "markdown/duz metin + query string", rewriteValue(s, FROM, TO).count, 2, s);
}
{
  const s = `https://${ESKI}.supabase.co/storage/v1/render/image/public/images/a.webp?width=200`;
  ok("metin", "render/image (donusturulmus gorsel) yolu da", rewriteValue(s, FROM, TO).value, s.replace(ESKI, YENI), s);
}
{
  const other = `<img src="${IMG("cccccccccccccccccccc", "a.webp")}">`;
  const r = rewriteValue(other, FROM, TO);
  ok("baska", "BASKA projenin adresi degismez", [r.count, r.value === other], [0, true], other);
}
{
  const api = `fetch("https://${ESKI}.supabase.co/rest/v1/news")`;
  const r = rewriteValue(api, FROM, TO);
  ok("baska", "storage DISI eski ref degismez", [r.count, r.value === api], [0, true], api);
  ok("baska", "ama DOKUNULMAYAN diye sayilir", countMentions(r.value, ESKI), 1, api);
}
{
  const same = "adres yok";
  const r = rewriteValue(same, FROM, TO);
  ok("metin", "adres yoksa ayni deger (kopya yok)", [r.count, r.value === same], [0, true], same);
}
{
  const jsonb = { logo: IMG(ESKI, "logo.png"), items: [{ img: IMG(ESKI, "1.png") }, { img: "yok" }], sayi: 3, bos: null, aktif: true };
  const r = rewriteValue(jsonb, FROM, TO);
  ok("jsonb", "ic ice nesne + dizi: 2 adres", r.count, 2, "jsonb");
  ok("jsonb", "tip korunur (sayi, null, boolean)", [r.value.sayi, r.value.bos, r.value.aktif, r.value.items[1].img], [3, null, true, "yok"], "types");
  ok("jsonb", "nesne yeni adresi tasir", r.value.items[0].img, IMG(YENI, "1.png"), "deep");
}
ok("dizi", "text[] dizisi", rewriteValue([IMG(ESKI, "a"), "x"], FROM, TO), { value: [IMG(YENI, "a"), "x"], count: 1 }, "array");
ok("ilkel", "sayi/null/undefined dokunulmaz", [rewriteValue(5, FROM, TO).count, rewriteValue(null, FROM, TO).value, rewriteValue(undefined, FROM, TO).count], [0, null, 0], "primitives");
ok("sayac", "countMentions buyuk/kucuk harf duyarsiz, jsonb serilestirilir", [countMentions(`X ${ESKI.toUpperCase()} y ${ESKI}`, ESKI), countMentions({ a: ESKI }, ESKI), countMentions(null, ESKI)], [2, 1, 0], "mentions");

// ---------------------------------------------------------------------------
header("(c) OpenAPI → tablolar");

const pkProp = (format = "uuid") => ({ format, description: "Note:\nThis is a Primary Key.<pk/>" });
const SPEC = {
  swagger: "2.0",
  definitions: {
    news: { properties: { id: pkProp(), tenant_id: { format: "uuid" }, content: { format: "text" }, cover_image: { format: "text" }, created_at: { format: "timestamp with time zone" } } },
    site_settings: { properties: { id: pkProp(), key: { format: "text" }, value: { format: "text" } } },
    tenants: { properties: { id: pkProp(), slug: { format: "text" }, enabled_modules: { format: "jsonb" } } },
    etiketli: { properties: { id: pkProp("bigint"), etiketler: { format: "text[]" }, ad: { format: "character varying" } } },
    gorunum: { properties: { id: { format: "uuid" }, baslik: { format: "text" } } },
    bilesik: { properties: { a: pkProp(), b: pkProp(), not: { format: "text" } } },
    sayilar: { properties: { id: pkProp(), adet: { format: "integer" } } },
  },
};
{
  const { tables, skipped } = textColumnsFromOpenApi(SPEC);
  ok("openapi", "metin/jsonb/dizi kolonlari bulunur, PK haric", tables, [
    { table: "etiketli", pk: "id", columns: ["etiketler", "ad"] },
    { table: "news", pk: "id", columns: ["content", "cover_image"] },
    { table: "site_settings", pk: "id", columns: ["key", "value"] },
    { table: "tenants", pk: "id", columns: ["slug", "enabled_modules"] },
  ], "spec");
  ok("openapi", "PK'siz ve bilesik PK atlanir + raporlanir; metinsiz tablo sessizce gecilir", skipped, [
    { table: "gorunum", reason: "birincil anahtar yok" },
    { table: "bilesik", reason: "bileşik birincil anahtar" },
  ], "skipped");
}

// ---------------------------------------------------------------------------
header("(d) runRewrite");

/** Sahte DB: tablo → satirlar. Sunucu `cap`ten fazla satir vermez. */
function fakeDb(data, { cap = 1000, failIds = new Set(), zeroIds = new Set() } = {}) {
  const updates = [];
  const pages = [];
  return {
    updates,
    pages,
    db: {
      fetchSpec: async () => SPEC,
      fetchPage: async (table, columns, pk, offset, limit) => {
        pages.push([table, offset, limit]);
        const rows = (data[table] ?? []).slice().sort((a, b) => (String(a[pk]) < String(b[pk]) ? -1 : 1));
        return rows.slice(offset, offset + Math.min(limit, cap)).map((r) => Object.fromEntries(columns.map((c) => [c, r[c]])));
      },
      updateRow: async (table, pk, id, changes) => {
        if (failIds.has(id)) throw new Error("izin yok");
        if (zeroIds.has(id)) return 0;
        updates.push([table, id, changes]);
        const row = data[table].find((r) => r[pk] === id);
        Object.assign(row, changes);
        return 1;
      },
    },
  };
}

function makeData() {
  const news = [];
  for (let i = 0; i < 1203; i++) {
    const id = `n${String(i).padStart(4, "0")}`;
    news.push({
      id,
      content: i % 400 === 0 ? `<p>x</p><img src="${IMG(ESKI, `t/${id}.webp`)}"><img src="${IMG(ESKI, `t/${id}-2.webp`)}">` : "<p>metin</p>",
      cover_image: i === 1202 ? IMG(ESKI, "t/son.webp") : null,
    });
  }
  return {
    news,
    site_settings: [
      { id: "s1", key: "logo_url", value: IMG(ESKI, "t/logo.png") },
      { id: "s2", key: "site_title", value: "Kurum" },
    ],
    tenants: [{ id: "t1", slug: "default", enabled_modules: { donations: true, banner: IMG(ESKI, "b.png") } }],
    etiketli: [{ id: 1, etiketler: ["a", IMG(ESKI, "e.png")], ad: "x" }],
  };
}

{
  const data = makeData();
  const f = fakeDb(data, { cap: 300 });
  const report = await runRewrite(f.db, { eski: ESKI, yeni: YENI, write: false, pageSize: 500 });
  ok("rapor", "RAPOR modunda HIC yazilmaz", f.updates.length, 0, "report");
  const col = (t, c) => report.columns.find((x) => x.table === t && x.column === c);
  ok("rapor", "sunucu 300'luk sayfa donse de 1203 satirin HEPSI (son satirdaki adres bulundu)", col("news", "cover_image").urls, 1, "cap=300");
  ok("rapor", "news.content: 4 satirda 8 HTML adresi", [col("news", "content").rows, col("news", "content").urls], [4, 8], "content");
  ok("rapor", "site_settings.value (logo)", [col("site_settings", "value").rows, col("site_settings", "value").urls], [1, 1], "settings");
  ok("rapor", "jsonb ve dizi kolonlari", [col("tenants", "enabled_modules").urls, col("etiketli", "etiketler").urls], [1, 1], "jsonb/array");
  ok("rapor", "toplam: 8 satir, 12 adres, dokunulmayan 0", [report.rowsChanged, totals(report)], [8, { urls: 12, leftover: 0 }], "totals");
  okFlag("rapor", "RAPOR + adres bulundu → cikis 0 (hata degil)", rewriteExitCode(report, null) === 0);
  ok("rapor", "atlanan tablolar raporda", report.skipped.map((s) => s.table), ["gorunum", "bilesik"], "skipped");
}
{
  const data = makeData();
  const f = fakeDb(data, { cap: 300 });
  const report = await runRewrite(f.db, { eski: ESKI, yeni: YENI, write: true });
  ok("yaz", "degisen her satir TEK guncelleme", f.updates.length, 8, "updates");
  const logoUpdate = f.updates.find(([t, id]) => t === "site_settings" && id === "s1");
  ok("yaz", "yalniz DEGISEN kolon gonderilir (key gonderilmez)", logoUpdate?.[2], { value: IMG(YENI, "t/logo.png") }, "changes");
  ok("yaz", "adressiz satira dokunulmaz", f.updates.some(([t, id]) => t === "site_settings" && id === "s2"), false, "s2");
  ok("yaz", "jsonb nesne olarak yazilir (tip korunur)", data.tenants[0].enabled_modules, { donations: true, banner: IMG(YENI, "b.png") }, "jsonb");
  const after = await runRewrite(f.db, { eski: ESKI, yeni: YENI, write: false });
  ok("yaz", "yeniden tarama: eski onekli adres 0", totals(after).urls, 0, "after");
  ok("yaz", "temiz yazim → cikis 0", rewriteExitCode(report, after), 0, "exit");
  const again = await runRewrite(f.db, { eski: ESKI, yeni: YENI, write: true });
  ok("yaz", "ikinci --yaz: hicbir satir degismez (tekrar kosulabilir)", [again.rowsChanged, f.updates.length], [0, 8], "idempotent");
}
{
  const data = makeData();
  const f = fakeDb(data, { failIds: new Set(["s1"]), zeroIds: new Set(["t1"]) });
  const report = await runRewrite(f.db, { eski: ESKI, yeni: YENI, write: true });
  ok("hata", "bir satirin hatasi digerlerini durdurmaz", f.updates.length, 6, "updates");
  ok("hata", "hata ve 0-satir guncellemesi raporlanir", report.failures.map((x) => [x.table, x.id]), [["site_settings", "s1"], ["tenants", "t1"]], "failures");
  const after = await runRewrite(f.db, { eski: ESKI, yeni: YENI, write: false });
  ok("hata", "hata → cikis 1; kalan adres de gorunur", [rewriteExitCode(report, after), totals(after).urls], [1, 2], "exit");
}
{
  const data = { site_settings: [{ id: "s1", key: "api", value: `https://${ESKI}.supabase.co/rest/v1/x` }], news: [], tenants: [], etiketli: [] };
  const report = await runRewrite(fakeDb(data).db, { eski: ESKI, yeni: YENI, write: false });
  ok("dokunulmayan", "storage disi eski ref → dokunulmayan 1, cikis 1 (elle bakilmali)", [totals(report).leftover, rewriteExitCode(report, null)], [1, 1], "leftover");
}

// ---------------------------------------------------------------------------
header("(e) Guard");

{
  const env = `NEXT_PUBLIC_SUPABASE_URL=https://${ESKI}.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=k`;
  let threw = null;
  try {
    resolveTarget(env, YENI, "t.env");
  } catch (err) {
    threw = err;
  }
  ok("guard", "env CANLIYI gosteriyor, --yeni test → DUR", threw instanceof TargetError && threw.message.includes("HEDEF UYUŞMUYOR"), true, String(threw?.message));

  const dir = mkdtempSync(join(tmpdir(), "rewrite-test-"));
  const envFile = join(dir, "canli.env");
  writeFileSync(envFile, env);
  const run = (args) => spawnSync(process.execPath, ["scripts/rewrite-storage-urls.mjs", ...args], { encoding: "utf8" });
  const mismatch = run(["--env", envFile, "--eski", "cccccccccccccccccccc", "--yeni", YENI]);
  ok("cli", "ref uyusmazsa ag cagrisi YAPILMADAN cikis 2", [mismatch.status, mismatch.stderr.includes("HEDEF UYUŞMUYOR")], [2, true], mismatch.stderr.trim());
  const same = run(["--env", envFile, "--eski", YENI, "--yeni", YENI]);
  ok("cli", "--eski = --yeni → cikis 2", [same.status, same.stderr.includes("aynı olamaz")], [2, true], same.stderr.trim());
  const bad = run(["--env", envFile, "--eski", "kisa", "--yeni", YENI]);
  ok("cli", "gecersiz ref → cikis 2", [bad.status, bad.stderr.includes("Geçersiz --eski")], [2, true], bad.stderr.trim());
  const noEnv = run(["--eski", ESKI, "--yeni", YENI]);
  ok("cli", "--env yoksa .env.local OKUNMAZ → cikis 2", [noEnv.status, noEnv.stderr.includes("zorunlu")], [2, true], noEnv.stderr.trim());
  rmSync(dir, { recursive: true, force: true });
}

function okFlag(group, name, cond) {
  ok(group, name, cond, true, "");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
