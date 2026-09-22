/**
 * B2 UYGULAMA 4 TAHMIN URETECI — kurumsuz host'lara eksik 10 public yol.
 *
 * KULLANIM (repo kokunden):  node scripts/izolasyon-temel/tahmin-uret-b2-4.mjs
 *   girdi: next-14.2.35.json (B2 uygulama 3 kaydi, 795 hucre)
 *   → tahmin-b2-4-belge.json + tahmin-b2-4.json
 *
 * NE BEKLENIYOR (koddan ONCE):
 *   Yalniz bilinmeyen-sub ve bilinmeyen-custom'a 10 yol × 4 varyant = 80 hucre.
 *   Hepsi VAR OLAN rotalar (eslesen rota, sayfa notFound) → ANALOG ayni
 *   host'un `/haberler` hucresi (liste sayfasi; {A.haber} ile birebir ayni —
 *   olculdu): html 404 notr, rsc 200 + notFound, prefetch 200, sahte etkisiz.
 *   Dinamik yollarin somut adresi apex sayfalarindaki ilk baglantidan secilir
 *   (anon anahtar bu tablolari goremiyor — RLS); hucre DEGERI adresten
 *   bagimsiz (kurumsuz host'ta her zaman notr 404). Secilen adresler KIMLIK
 *   icin `semboller.kurumsuzYol`'da; bugunku degerler on olcumden (curl, apex
 *   /subeler, /kurumsal/yonetim-kurulu, /, /galeri — galeride yayinda album
 *   YOK → yer tutucu).
 *   Kural: analog `/haberler`'in kurumsuz host kurallari 5/7/2/2 (B2-3 on
 *   olcum --ayrinti) × 10 yol × 2 host = +100/+140/+40/+40.
 *
 * Matrisin kodunu IMPORT ETMEZ. Tabloda olmayan durumda DURUR.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const DIZIN = new URL("./", import.meta.url);
const dur = (m) => { console.log(`DUR: ${m}`); process.exit(1); };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const girdiMetin = readFileSync(new URL("next-14.2.35.json", DIZIN));
const GIRDI_SHA = process.env.GIRDI_SHA;
if (!GIRDI_SHA || sha(girdiMetin) !== GIRDI_SHA) dur(`girdi sha ${sha(girdiMetin)} (GIRDI_SHA ile verilmeli)`);
const girdi = JSON.parse(girdiMetin);

const HOSTLAR = ["bilinmeyen-sub", "bilinmeyen-custom"];
const VARYANT = ["html", "rsc", "prefetch", "sahte"];
const ANALOG = "/haberler";
const YER_TUTUCU_UUID = "00000000-0000-4000-8000-000000000000";
// etiket → bugun secilecek somut adres (on olcum)
const YOLLAR = {
  "/duyurular": "/duyurular",
  "/galeri": "/galeri",
  "/iletisim": "/iletisim",
  "/subeler": "/subeler",
  "/kurumsal/yonetim-kurulu": "/kurumsal/yonetim-kurulu",
  "/galeri/{A.album}": `YER-TUTUCU /galeri/${YER_TUTUCU_UUID}`,
  "/subeler/{A.sube}": "/subeler/istanbul-avrupa-subesi",
  "/subeler/{A.sube}/yonetici": "/subeler/istanbul-avrupa-subesi/yonetici",
  "/yonetim-kurulu/{A.uye}": "/yonetim-kurulu/ayse-kaya",
  "/bolum/{A.bolum}": "/bolum/6b759bf8-1337-4937-9eb8-4816f2dcf3d9",
};

const gozlem = JSON.parse(JSON.stringify(girdi.gozlem));
let n = 0;
for (const h of HOSTLAR) for (const y of Object.keys(YOLLAR)) for (const v of VARYANT) {
  const k = `${v}|${h}|${y}`, a = `${v}|${h}|${ANALOG}`;
  if (k in gozlem) dur(`hucre zaten var: ${k}`);
  if (!gozlem[a]) dur(`analog yok: ${a}`);
  gozlem[k] = JSON.parse(JSON.stringify(gozlem[a])); n++;
}
if (n !== 80) dur(`yeni hucre ${n}`);
const BOLUM_ONCE = { "0": 4, "1": 724, "2": 970, "3": 295, "4": 190, "5": 8, "6": 62, "7": 17 };
const ANALOG_KURAL = { "1": 5, "2": 7, "3": 2, "4": 2 };
const bolum = { ...BOLUM_ONCE };
for (const b of Object.keys(ANALOG_KURAL)) bolum[b] += ANALOG_KURAL[b] * 10 * 2;

const sirali = Object.fromEntries(Object.keys(gozlem).sort().map((k) => [k, gozlem[k]]));
const belge = {
  ...girdi,
  kaydedildi: `TAHMIN (tahmin-uret-b2-4.mjs, girdi ${girdi.kaydedildi})`,
  semboller: { ...girdi.semboller, kurumsuzYol: YOLLAR },
  gozlem: sirali,
};
const metin = JSON.stringify(belge, null, 2) + "\n";
writeFileSync(new URL("tahmin-b2-4-belge.json", DIZIN), metin);
const toplam = Object.values(bolum).reduce((a, b) => a + b, 0);
const tahmin = {
  tur: "B2 uygulama 4 — kurumsuz host'lara eksik 10 public yol",
  yazildi: new Date().toISOString(),
  not: `KODDAN ONCE uretildi (tahmin-uret-b2-4.mjs). Kosu temel_belge'ye BIREBIR: ${Object.keys(sirali).length} hucre (795 + 80), fark 0, FAIL 0, KIMLIK 'degisiklik yok' (kurumsuzYol tablosu belgede).`,
  temel_belge: { yol: "scripts/izolasyon-temel/tahmin-b2-4-belge.json", sha256: sha(metin) },
  fark_satirlari: [], yeni_hucreler: [], kayip_hucreler: [], kapsama_kaybi: [], kapsama_artti: [],
  beklenen_fail: [], beklenen_bilinen_kusur: {},
  bolum_sayilari_gecti: bolum,
  beklenen_sonuc_satiri: `SONUC: ${toplam} gecti, 0 kaldi (bilinen kusur: 0, temel cizgi farki: 0)`,
};
writeFileSync(new URL("tahmin-b2-4.json", DIZIN), JSON.stringify(tahmin, null, 2) + "\n");
console.log(`hucre ${Object.keys(sirali).length} · ${tahmin.beklenen_sonuc_satiri} · bolum ${JSON.stringify(bolum)}`);
console.log(`belge sha256 ${tahmin.temel_belge.sha256}`);
