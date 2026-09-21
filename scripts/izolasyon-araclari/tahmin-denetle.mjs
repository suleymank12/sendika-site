/**
 * TAHMIN DENETCISI — kilitli bir tahmini izolasyon matrisinin ciktisiyla
 * karsilastirir (K7-B / K8 / B4 kapisi).
 *
 * KULLANIM:
 *   npm run izolasyon:denetle -- <tahmin.json> <matris-ciktisi.txt>
 *   (dogrudan: node scripts/izolasyon-araclari/tahmin-denetle.mjs …)
 *   Yollar calisma dizinine gore cozulur. Cikis 0 = birebir, 1 = sapma.
 *
 * TAHMIN BICIMI (scripts/izolasyon-temel/tahmin-*.json):
 *   beklenen_fail            FAIL iddia kimlikleri
 *   fark_satirlari           "~ hucre.alan: eski → yeni" satirlari (temel cizgi farki)
 *   yeni_hucreler            "+ YENI HUCRE" anahtarlari
 *   kayip_hucreler           "- KAYIP HUCRE" anahtarlari
 *   kapsama_kaybi            "- KAPSAMA KAYBI" anahtarlari (gercek → YOK; B4 P7, kirmizi)
 *   kapsama_artti            "HEDEF DURUMU DEGISTI (kapsama artti…)" yuvalari (YOK → gercek; bilgi)
 *                            (ikisi de yoksa [] sayilir — B4 oncesi tahminler)
 *   beklenen_bilinen_kusur   { K?: adet }
 *   bolum_sayilari_gecti     { "0": n, … } — bolum basliklarindaki "gecti" sayilari
 *   beklenen_sonuc_satiri    son "SONUC:" satiri, birebir
 *
 * 🔴 KURAL: tahmin koddan ONCE yazilir ve sha256 ile kilitlenir. Tek satir
 * sapma = DUR (temel cizgi kaydedilmez). Tahmin ureteci yalniz (a) duzeltme
 * kosudan ONCE yazili + sha'li ongorulmusse VE (b) eksik bir KURALA dairse
 * degistirilebilir; bir degeri tutturmak icin asla (NOTE.md "🔑 K8").
 *
 * ⚠️ Bu denetci matrisin cikti BICIMINE bagli. Matrisin rapor satirlari
 * degisirse ayni commit'te burasi da guncellenmeli — yoksa eski bicimi arar,
 * hicbir satir bulamaz ve SAHTE "birebir" verebilir.
 */
import { readFileSync } from "node:fs";

if (process.argv.length < 4) {
  console.log("Kullanim: tahmin-denetle.mjs <tahmin.json> <matris-ciktisi.txt>");
  process.exit(2);
}
const t = JSON.parse(readFileSync(process.argv[2], "utf8"));
const satirlar = readFileSync(process.argv[3], "utf8").split(/\r?\n/);

const fail = new Set(satirlar.filter((s) => /^\s+FAIL\s/.test(s)).map((s) => s.trim().replace(/^FAIL\s+/, "").replace(/ — .*$/, "")));
const degisen = new Set(satirlar.filter((s) => /^\s+~ /.test(s)).map((s) => s.trim()));
const yeni = new Set(satirlar.filter((s) => /^\s+\+ YENI HUCRE/.test(s)).map((s) => s.trim().replace(/^\+ YENI HUCRE\s+/, "").replace(/: [{\[].*$/, "")));
const kayip = new Set(satirlar.filter((s) => /^\s+- KAYIP HUCRE/.test(s)).map((s) => s.trim().replace(/^- KAYIP HUCRE\s+/, "").replace(/: [{\[].*$/, "")));
const kapsamaKaybi = new Set(satirlar.filter((s) => /^\s+- KAPSAMA KAYBI/.test(s)).map((s) => s.trim().replace(/^- KAPSAMA KAYBI\s+/, "")));
const kapsamaArtti = new Set(satirlar.map((s) => (s.match(/^\s+HEDEF DURUMU DEGISTI \(kapsama artti[^)]*\): (\S+)/) || [])[1]).filter(Boolean));
const bilinen = {};
for (const s of satirlar) { const m = s.match(/^\s+(K\d+) ×(\d+):/); if (m) bilinen[m[1]] = Number(m[2]); }
const bolum = {};
for (const s of satirlar) { const m = s.match(/^--- \((\d)\)[^:]*: (\d+) gecti/); if (m) bolum[m[1]] = Number(m[2]); }
const sonuc = (satirlar.find((s) => s.startsWith("SONUC:")) || "").trim();

let dur = false;
const out = [];
const kume = (ad, gorulen, beklenen) => {
  const fazla = [...gorulen].filter((x) => !beklenen.has(x)), eksik = [...beklenen].filter((x) => !gorulen.has(x));
  out.push(`${ad}: beklenen ${beklenen.size} · gorulen ${gorulen.size} · BEKLENMEYEN ${fazla.length} · GELMEYEN ${eksik.length}`);
  fazla.forEach((x) => out.push(`    BEKLENMEYEN  ${x}`));
  eksik.forEach((x) => out.push(`    GELMEYEN     ${x}`));
  if (fazla.length || eksik.length) dur = true;
};
kume("FAIL iddialar", fail, new Set(t.beklenen_fail));
kume("degisen alan satirlari", degisen, new Set(t.fark_satirlari));
kume("yeni hucreler", yeni, new Set(t.yeni_hucreler));
kume("kayip hucreler", kayip, new Set(t.kayip_hucreler));
kume("kapsama kaybi (VAR → YOK)", kapsamaKaybi, new Set(t.kapsama_kaybi || []));
kume("kapsama artisi (YOK → VAR, yuva)", kapsamaArtti, new Set(t.kapsama_artti || []));
const bOk = JSON.stringify(bilinen) === JSON.stringify(t.beklenen_bilinen_kusur);
out.push(`bilinen kusurlar: gorulen ${JSON.stringify(bilinen)} · beklenen ${JSON.stringify(t.beklenen_bilinen_kusur)} ${bOk ? "✓" : "✗"}`); if (!bOk) dur = true;
const bolOk = JSON.stringify(bolum) === JSON.stringify(t.bolum_sayilari_gecti);
out.push(`bolum gecti sayilari: gorulen ${JSON.stringify(bolum)}\n                      beklenen ${JSON.stringify(t.bolum_sayilari_gecti)} ${bolOk ? "✓" : "✗"}`); if (!bolOk) dur = true;
const sOk = sonuc === t.beklenen_sonuc_satiri;
out.push(`SONUC satiri: ${sOk ? "✓" : "✗"}\n    gorulen : ${sonuc}\n    beklenen: ${t.beklenen_sonuc_satiri}`); if (!sOk) dur = true;
if (!sonuc) { out.push("🔴 ciktida SONUC satiri yok — matris kosmamis ya da bicim degismis"); dur = true; }
out.push(dur ? "HUKUM: 🔴 TAHMINDEN SAPMA — DUR, temel cizgi KAYDEDILMEZ" : "HUKUM: TAHMINLE BIREBIR — devam");
console.log(out.join("\n"));
process.exitCode = dur ? 1 : 0;
