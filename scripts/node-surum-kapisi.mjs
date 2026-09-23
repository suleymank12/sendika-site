/**
 * NODE SURUM KAPISI (24 Eylul 2026, Node 22 turu)
 *
 * package.json "engines.node" araligini CALISAN Node'a karsi sinar; uymazsa
 * cikis 1. Iki kullanim:
 *
 *   1) prebuild:  "prebuild": "node scripts/node-surum-kapisi.mjs build"
 *      .npmrc'deki engine-strict yalniz `npm ci` / `npm install`'i durdurur;
 *      `npm run` engines'e BAKMAZ (olculdu). node_modules eski kurulumdan
 *      kalmissa yanlis Node'la build yine alinirdi.
 *   2) olcum araclari (izolasyon kapisi, korlesme, matris, temel cizgi
 *      kaydi) EN BASTA: import { nodeSurumKapisi } … ; nodeSurumKapisi("ad")
 *      NEDEN: Node turunda ortaya cikti — temel cizgiler hep yerelde 24.13.1
 *      ile alinmis, uretim 20'deydi; "taban" hic olculmemisti. Uretimle ayni
 *      ana surum olmayan Node'da kapi kosmaz, temel cizgi kaydedilmez.
 *
 * Bagimlilik yok (semver kurulu olmayabilir): yalniz bosluklarla ayrilmis
 * ">=X.Y.Z" / "<X" / ">X" / "<=X" / "=X" karsilastiricilarini anlar.
 * Bilinmeyen bicimde aralik yazilirsa SESSIZCE GECMEZ, hata verir.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const parcala = (v) => {
  const p = v.split(".").map(Number);
  while (p.length < 3) p.push(0);
  return p;
};
const karsilastir = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/** Uygunsa { uygun: true }, degilse { uygun: false, neden } — cikmaz. */
export function nodeSurumUygun(surum = process.versions.node) {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const aralik = pkg.engines?.node;
  if (!aralik) return { uygun: false, aralik, neden: "package.json'da engines.node yok" };
  const simdi = parcala(surum);
  for (const k of aralik.trim().split(/\s+/)) {
    const m = k.match(/^(>=|<=|>|<|=)?(\d+(?:\.\d+){0,2})$/);
    if (!m) return { uygun: false, aralik, neden: `engines.node "${aralik}" anlasilamadi ("${k}")` };
    const f = karsilastir(simdi, parcala(m[2]));
    const tamam = { ">=": f >= 0, "<=": f <= 0, ">": f > 0, "<": f < 0, "=": f === 0 }[m[1] || "="];
    if (!tamam) return { uygun: false, aralik, neden: `Node ${surum} bu proje icin uygun degil (engines.node "${aralik}")` };
  }
  return { uygun: true, aralik };
}

/** Uygun degilse aciklamayi basip surecten 1 ile cikar. */
export function nodeSurumKapisi(ad) {
  const r = nodeSurumUygun();
  if (r.uygun) return;
  console.error(`🔴 ${ad}: ${r.neden}.`);
  console.error(`   DURDURULDU. Bu projede Node surumu NOTE.md "Her oturum basinda" bolumundeki gibi etkinlestirilir.`);
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ad = process.argv[2] || "node-surum-kapisi";
  nodeSurumKapisi(ad);
  console.log(`node-surum-kapisi (${ad}): Node ${process.versions.node} uygun (${nodeSurumUygun().aralik})`);
}
