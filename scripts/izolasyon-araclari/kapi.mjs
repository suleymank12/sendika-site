/**
 * IZOLASYON KAPISI — tek komut:
 *   (1) veri kapisi ONCE → (2) temiz build + izolasyon:tam → (3) veri kapisi
 *   SONRA (kaymissa DUR) → (4) kilitli tahminle denetim.
 *
 * KULLANIM:
 *   npm run izolasyon:kapi -- --tahmin <tahmin.json> [--temel <belge.json>]
 *                             [--build-yok] [--cikti <dizin>]
 *
 *   --tahmin    kilitli tahmin (bicim: tahmin-denetle.mjs). sha256'si basilir.
 *   --temel     karsilastirilacak gozlem belgesi (IZOLASYON_TEMEL). Tahmin tam
 *               beklenen belgeyse (B4 C3/C4 donusturucu ciktisi) kosu ona
 *               BIREBIR uymali. Tahminde `temel_belge: {yol, sha256}` varsa o
 *               kullanilir ve sha dogrulanir.
 *   --build-yok mevcut .next ile (varsayilan: .next SILINIR, temiz build).
 *   --cikti     ara dosyalarin dizini (varsayilan: isletim sistemi gecici dizini).
 *
 * Cikis: 0 = kapi gecti (veri ayni + tahminle birebir), 1 = tahminden sapma,
 * 2 = veri kosu sirasinda degisti / kullanim hatasi.
 *
 * Temel cizgiyi KAYDETMEZ — kapi gectikten sonra bilincli olarak:
 *   node scripts/izolasyon-kos.mjs --build-yok --kaydet --uzerine-yaz
 */
import { nodeSurumKapisi } from "../node-surum-kapisi.mjs";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
nodeSurumKapisi("izolasyon:kapi"); // uretimle ayni ana surum degilse DUR (NOTE.md "Her oturum basinda")

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const ARAC = fileURLToPath(new URL("./", import.meta.url));
const argv = process.argv.slice(2);
const deger = (ad) => { const i = argv.indexOf(ad); return i >= 0 ? argv[i + 1] : undefined; };
const tahminYol = deger("--tahmin");
if (!tahminYol || !existsSync(tahminYol)) {
  console.log("Kullanim: kapi.mjs --tahmin <tahmin.json> [--temel <belge.json>] [--build-yok] [--cikti <dizin>]");
  process.exit(2);
}
const sha = (yol) => createHash("sha256").update(readFileSync(yol)).digest("hex");
const cikti = path.resolve(deger("--cikti") || path.join(tmpdir(), `izolasyon-kapi-${new Date().toISOString().replace(/[:.]/g, "-")}`));
mkdirSync(cikti, { recursive: true });

const tahmin = JSON.parse(readFileSync(tahminYol, "utf8"));
let temel = deger("--temel");
if (!temel && tahmin.temel_belge) {
  temel = path.resolve(REPO, tahmin.temel_belge.yol);
  if (sha(temel) !== tahmin.temel_belge.sha256) {
    console.log(`🔴 DUR: temel belge sha'si tahmindekiyle ayni degil (${tahmin.temel_belge.yol})`);
    process.exit(2);
  }
}
console.log(`KAPI — tahmin ${tahminYol} (sha256 ${sha(tahminYol)})`);
if (temel) console.log(`       temel ${temel} (sha256 ${sha(temel)})`);
console.log(`       ara dosyalar: ${cikti}`);

const node = (betik, args, env = {}) => spawnSync(process.execPath, [betik, ...args], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20, env: { ...process.env, ...env } });
// Matris ve veri kapisi AYNI belgeyi okur (sabit B oradan gelir).
const temelEnv = temel ? { IZOLASYON_TEMEL: pathToFileURL(temel).href } : {};
const veri = (etiket) => {
  const yol = path.join(cikti, `veri-${etiket}.json`);
  const r = node(path.join(ARAC, "veri-kontrol.mjs"), [etiket, yol], temelEnv);
  process.stdout.write(r.stdout || ""); process.stderr.write(r.stderr || "");
  if (r.status !== 0) { console.log(`🔴 DUR: veri kapisi okunamadi (${etiket})`); process.exit(2); }
  return JSON.parse(readFileSync(yol, "utf8"));
};

// (1) veri ONCE
const once = veri("once");

// (2) temiz build + izolasyon:tam
const kosArgs = [];
if (argv.includes("--build-yok")) kosArgs.push("--build-yok");
else rmSync(path.join(REPO, ".next"), { recursive: true, force: true });
const t0 = Date.now();
const m = node(path.join(REPO, "scripts", "izolasyon-kos.mjs"), kosArgs, temelEnv);
const matris = path.join(cikti, "matris.txt");
writeFileSync(matris, (m.stdout || "") + (m.stderr || ""));
const sonuc = ((m.stdout || "").match(/^SONUC:.*$/m) || ["(SONUC yok)"])[0];
console.log(`matris (${Math.round((Date.now() - t0) / 1000)} sn): ${sonuc}`);

// (3) veri SONRA
const sonra = veri("sonra");
if (once.sha256 !== sonra.sha256) {
  console.log(`🔴 DUR: canli veri kosu sirasinda DEGISTI (${once.sha256.slice(0, 16)}… → ${sonra.sha256.slice(0, 16)}…) — sonuc yorumlanmaz, temel cizgi kaydedilmez.`);
  process.exit(2);
}
console.log(`veri kapisi: AYNI (${once.sha256})`);

// (4) denetci
const d = node(path.join(ARAC, "tahmin-denetle.mjs"), [path.resolve(tahminYol), matris]);
process.stdout.write(d.stdout || ""); process.stderr.write(d.stderr || "");
console.log(d.status === 0 ? "KAPI: GECTI" : "KAPI: 🔴 DUR — tahminden sapma");
process.exit(d.status === 0 ? 0 : 1);
