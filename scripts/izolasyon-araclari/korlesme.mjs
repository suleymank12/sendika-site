/**
 * KORLESME TESTLERI (B4, 22 Eylul 2026) — izolasyon matrisini canli veriye
 * duyarsiz yapan normalizasyon onu KOR etti mi?
 *
 * Her senaryo matrisi, yalniz matris surecinin Supabase okumasina enjeksiyonla
 * (enjekte.cjs; veritabanina YAZMA YOK) ya da degistirilmis bir temel cizgiyle
 * kosar ve SONUCU bekleneniyle karsilastirir:
 *
 *   K0  kontrol                      → fark 0, FAIL 0
 *   T5  NEGATIF kontrol (duyarsizlik): hedef baska bir satira gecer (baska
 *       haber / duyuru, farkli sinifta manset, baska genel sayfa)
 *                                    → fark 0, FAIL 0 (hedef degisimi yalniz KIMLIK teshisinde)
 *   T6  POZITIF kontrol (sahiplik):  A'nin haber yuvasina B'nin haberi konur
 *                                    → A host'unda `kendi-detay-acilir`, B host'unda
 *                                      `capraz-detay-404` KURAL FAIL'i
 *   T7a kapsama artisi: bir yuva temel cizgide YOK, kosuda gercek
 *                                    → fark 0, FAIL 0, "kapsama artti" bilgisi
 *   T7b kapsama kaybi: yuvanin sinifindaki satirlar cikarilir
 *                                    → 28 "KAPSAMA KAYBI" (kirmizi), FAIL 0
 *   T9  sizinti sozlugu tabani: B'nin tum icerigi cikarilir
 *                                    → `ortam|sizinti sozlugu B yeterli` FAIL
 *
 * Hedef satirlari CALISMA ANINDA secilir (hedef-secimi.mjs) — sabit id yok;
 * veride aday yoksa senaryo "ATLANDI (veride aday yok)" der, gecti sayilmaz.
 *
 * CALISTIRMA:
 *   npm run izolasyon:korlesme          build + next start (3100) + bu betik
 *   npm run test:izolasyon-korlesme     ayakta PRODUCTION sunucuya karsi
 *                                       (IZOLASYON_URL, vars. 3000); yoksa ATLANDI
 */
import { nodeSurumKapisi } from "../node-surum-kapisi.mjs";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { YUVALAR, hedefleriSec, listeleriOku, sabitBSec, temelSec } from "./hedef-secimi.mjs";
nodeSurumKapisi("izolasyon korlesme"); // uretimle ayni ana surum degilse DUR (NOTE.md "Her oturum basinda")

const REPO_URL = new URL("../../", import.meta.url);
const REPO = fileURLToPath(REPO_URL);
const MATRIS = path.join(REPO, "scripts", "test-izolasyon-matrisi.mjs");
const ENJEKTE = fileURLToPath(new URL("./enjekte.cjs", import.meta.url));
const ZORUNLU = process.env.IZOLASYON_ZORUNLU === "1";
const TABLO = { haber: "news", duyuru: "announcements", sayfa: "pages", manset: "headlines" };

const env = { ...process.env };
const envYol = new URL(".env.local", REPO_URL);
if (existsSync(envYol)) {
  for (const s of readFileSync(envYol, "utf8").split(/\r?\n/)) {
    const m = s.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
  }
}
const q = async (p) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${p}`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`${p}: ${JSON.stringify(j)}`);
  return j;
};

// --- matrisi kos + ciktisini ayristir -----------------------------------------
function kos({ enjekte, temelBelge } = {}) {
  const e2 = { ...process.env };
  const args = [];
  if (enjekte) { args.push("--require", ENJEKTE); e2.IZOLASYON_ENJEKTE = JSON.stringify(enjekte); }
  if (temelBelge) e2.IZOLASYON_TEMEL = pathToFileURL(temelBelge).href;
  const r = spawnSync(process.execPath, [...args, MATRIS], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20, env: e2 });
  const c = (r.stdout || "") + (r.stderr || "");
  const sonuc = (c.match(/^SONUC:.*$/m) || [""])[0];
  return {
    cikti: c,
    cikis: r.status,
    sonuc,
    atlandi: /^SONUC: ATLANDI/m.test(c),
    fark: Number((sonuc.match(/temel cizgi farki: (\d+)/) || [])[1] ?? NaN),
    fail: [...c.matchAll(/^\s+FAIL\s+(.+?)(?: — .*)?$/gm)].map((m) => m[1]),
    kapsamaKaybi: (c.match(/^\s+- KAPSAMA KAYBI/gm) || []).length,
    kapsamaArtti: [...c.matchAll(/HEDEF DURUMU DEGISTI \(kapsama artti[^)]*\): (\S+)/g)].map((m) => m[1]),
    enjekte: (c.match(/^\[enjekte\]/gm) || []).length,
  };
}

let gecti = 0, kaldi = 0, atlandi = 0;
const rapor = (ok, ad, ayrinti) => {
  if (ok === null) { atlandi++; console.log(`  ATLANDI  ${ad} — ${ayrinti}`); return; }
  ok ? gecti++ : kaldi++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${ad} — ${ayrinti}`);
};
const ozet = (s) => `${s.sonuc.replace("SONUC: ", "")}${s.fail.length ? ` · FAIL ${s.fail.length}` : ""}${s.enjekte ? ` · enjeksiyon ${s.enjekte}` : ""}`;

// --- K0 kontrol (ortam kapisi da burada) ---------------------------------------
console.log("Korlesme testleri — izolasyon matrisi (B4)");
const k0 = kos();
if (k0.atlandi) {
  console.log(`\n  ⚠️  ATLANDI — matris kosmadi (sunucu yok / dev sunucusu). ${k0.sonuc}`);
  console.log("SONUC: ATLANDI (0 kontrol)");
  process.exit(ZORUNLU ? 1 : 0);
}
rapor(k0.fark === 0 && k0.fail.length === 0, "K0 kontrol: fark 0, FAIL 0", ozet(k0));
if (k0.fark !== 0 || k0.fail.length) {
  console.log("\n🔴 Kontrol kosusu temiz degil — enjeksiyon senaryolari yorumlanamaz.");
  console.log(`SONUC: ${gecti} gecti, ${kaldi + 1} kaldi`);
  process.exit(1);
}

// --- veri: kurumlar + hedefler (calisma aninda) --------------------------------
const nextSurum = JSON.parse(readFileSync(new URL("node_modules/next/package.json", REPO_URL), "utf8")).version;
const temelYol = temelSec(new URL("scripts/izolasyon-temel/", REPO_URL), nextSurum, env);
const temel = JSON.parse(readFileSync(temelYol, "utf8"));
const kurumlar = await q("tenants?select=id,slug,name,custom_domain,is_active");
const A = kurumlar.find((k) => k.slug === "default");
const { B } = sabitBSec(kurumlar, temel, null);
const listeler = await listeleriOku(q);
const secilen = hedefleriSec(listeler, A, B);
const yuva = (ad) => YUVALAR.find(([y]) => y === ad);
const adaylar = (k, ad) => { const [, liste, kosul] = yuva(ad); return listeler[liste].filter((x) => x.tenant_id === k.id && kosul(x)); };

// --- T5 negatif kontrol ---------------------------------------------------------
const T5 = [
  ["T5 A.haber baska habere gecer", "haber", A, (x) => x.id !== secilen["A.haber"]?.id && x.tenant_id === A.id && !!x.cover_image],
  ["T5 B.haber baska habere gecer", "haber", B, (x) => x.id !== secilen["B.haber"]?.id && x.tenant_id === B.id && !!x.cover_image],
  ["T5 A.duyuru baska duyuruya gecer", "duyuru", A, (x) => x.id !== secilen["A.duyuru"]?.id && x.tenant_id === A.id],
  ["T5 A.manset'in onune baska sinif manset gelir", "manset", A, (x) => x.tenant_id === A.id && x.source_type !== "news"],
  ["T5 A.sayfa-genel baska genel sayfaya gecer", "sayfa", A, (x) => x.id !== secilen["A.sayfa-genel"]?.id && x.tenant_id === A.id && !yuva("sayfa")[2](x)],
];
for (const [ad, liste, , uygun] of T5) {
  const x = listeler[liste].find(uygun);
  if (!x) { rapor(null, ad, "veride aday yok"); continue; }
  const s = kos({ enjekte: [{ tablo: TABLO[liste], islem: "basa", id: x.id }] });
  rapor(s.fark === 0 && s.fail.length === 0 && s.enjekte > 0, `${ad} (${x.id.slice(0, 8)}${x.slug ? ` ${x.slug}` : ""})`, ozet(s));
}

// --- T6 pozitif kontrol: B'nin haberi A'nin yuvasinda ------------------------------
{
  const bh = secilen["B.haber"];
  if (!bh) rapor(null, "T6 sahiplik", "B'nin kapakli haberi yok");
  else {
    const s = kos({ enjekte: [{ tablo: "news", islem: "kurum", id: bh.id, kurum: A.id }] });
    const kendi = s.fail.filter((f) => /^(apex|A-sub|bilinmeyen-custom)\|\{A\.haber\}\|kendi-detay-acilir$/.test(f));
    const capraz = s.fail.filter((f) => /^(B-sub|B-custom)\|\{A\.haber\}\|.*capraz-detay-404$/.test(f));
    rapor(kendi.length > 0 && capraz.length > 0, "T6 A.haber yuvasina B'nin haberi → kendi-detay-acilir + capraz-detay-404 KURAL FAIL'i", `${ozet(s)} · kendi-detay-acilir ${kendi.length}, capraz-detay-404 ${capraz.length}`);
  }
}

// --- T7 asimetrik kapsama ---------------------------------------------------------
{
  const aday = ["manset-duyuru", "sayfa-genel", "manset-ozel", "duyuru"].find((ad) => secilen[`A.${ad}`]);
  if (!aday) { rapor(null, "T7a/T7b kapsama", "A'da gercek yuva yok"); }
  else {
    const Y = `{A.${aday}}`;
    const kopya = JSON.parse(JSON.stringify(temel));
    let n = 0;
    for (const k of Object.keys(kopya.gozlem)) if (k.split("|")[2] === Y) { kopya.gozlem[k] = { hedef: "YOK" }; n++; }
    kopya.hedefler[`A.${aday}`] = "YOK";
    const dosya = path.join(mkdtempSync(path.join(tmpdir(), "izolasyon-korlesme-")), "t7a-temel.json");
    writeFileSync(dosya, JSON.stringify(kopya, null, 2));
    const a = kos({ temelBelge: dosya });
    rapor(a.fark === 0 && a.fail.length === 0 && a.kapsamaArtti.includes(Y), `T7a ${Y} YOK → gercek: kapsama artisi, kirmizi degil`, `${ozet(a)} · kapsama artti: ${a.kapsamaArtti.join(",") || "-"}`);
    const [, liste] = yuva(aday);
    const cikar = adaylar(A, aday).map((x) => ({ tablo: TABLO[liste], islem: "cikar", id: x.id }));
    const b = kos({ enjekte: cikar });
    rapor(b.kapsamaKaybi === n && b.fail.length === 0 && b.cikis !== 0, `T7b ${Y} gercek → YOK: ${n} KAPSAMA KAYBI (kirmizi)`, `${ozet(b)} · kapsama kaybi ${b.kapsamaKaybi}`);
  }
}

// --- T9 sizinti sozlugu tabani ------------------------------------------------------
{
  const s = kos({ enjekte: [{ tablo: "*", islem: "kurum-cikar", kurum: B.id }] });
  const t = s.fail.some((f) => f.startsWith("ortam|sizinti sozlugu B yeterli"));
  rapor(t, "T9 B'nin icerigi yok → `ortam|sizinti sozlugu B yeterli` KURAL FAIL'i", ozet(s));
}

console.log(`\nSONUC: ${gecti} gecti, ${kaldi} kaldi${atlandi ? ` (atlandi: ${atlandi})` : ""}`);
process.exitCode = kaldi === 0 ? 0 : 1;
