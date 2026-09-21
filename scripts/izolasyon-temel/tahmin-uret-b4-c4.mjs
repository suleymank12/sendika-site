/**
 * B4 C4 TAHMIN URETECI — eksik hedef yer tutucusu + uc yeni yuva.
 *
 * KULLANIM (repo kokunden):  node scripts/izolasyon-temel/tahmin-uret-b4-c4.mjs
 *   girdi: scripts/izolasyon-temel/next-14.2.35.json (C3 kaydi)
 *   → tahmin-b4-c4-belge.json (tam beklenen belge) + tahmin-b4-c4.json (denetci)
 *
 * NE BEKLENIYOR:
 *   1) Mevcut 515 hucre AYNEN.
 *   2) Uc yeni A yuvasi (84 hucre) — ANALOG yuvanin hucreleri + ELLE yazilmis
 *      farklar (asagidaki FARK tablosu). Farklarin kaynagi iki bagimsiz olcum:
 *        - B4 olcum turu I2/I3/I5 (raporlar/2026-09-22-0125-…): ayni satirlar
 *          eski yuvaya enjekte edildiginde yalniz bu alanlar degisti;
 *        - C4 oncesi gecici yuva olcumu (C3 matrisi, --build-yok): yeni
 *          hucrelerin gercek gozlemi analogdan TAM bu alanlarda ayrildi.
 *      Secilen satirlar (olculdu): manset-ozel 3899e251 (custom), manset-duyuru
 *      f9335173 (announcement → A'nin duyurusu), sayfa-genel 4c3451cf
 *      misyon-ve-vizyon (kurumsal DEGIL; created_at sirasinda ilk).
 *   3) B'de karsiligi olmayan 5 yuva (B.duyuru, B.sayfa, B.sayfa-genel,
 *      B.manset-ozel, B.manset-duyuru) × 7 host × 4 varyant = 140 YER TUTUCU
 *      { hedef: "YOK" } — kurali yok, istek atilmaz.
 *   Kural sayisi: analog yuvanin kurallari (C3 --ayrinti sayimi) — manset-ozel
 *   yonlendirmez, analogun 3 `yonlendirme-kendi-kurumuna` kurali eksilir.
 *
 * Matrisin kodunu IMPORT ETMEZ. Tabloda olmayan durumda DURUR.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const DIZIN = new URL("./", import.meta.url);
const girdi = JSON.parse(readFileSync(new URL("next-14.2.35.json", DIZIN), "utf8"));
const dur = (m) => { console.log(`DUR: ${m}`); process.exit(1); };

const HOSTLAR = ["apex", "A-sub", "B-sub", "B-custom", "bilinmeyen-sub", "bilinmeyen-custom", "superadmin"];
const VARYANT = ["html", "rsc", "prefetch", "sahte"];
const A_HOSTLARI = ["apex", "A-sub", "bilinmeyen-custom"];

// yeni yuva → [analog yuva, { "tur|host": { alan: yeni deger } }]
const FARK = {
  "{A.manset-ozel}": ["{A.manset}", Object.fromEntries(A_HOSTLARI.flatMap((h) => [[`html|${h}`, { durum: 200, konum: null }], [`rsc|${h}`, { isaret: null }]]))],
  "{A.manset-duyuru}": ["{A.manset}", Object.fromEntries(A_HOSTLARI.map((h) => [`html|${h}`, { konum: "/duyurular/{A}" }]))],
  "{A.sayfa-genel}": ["{A.sayfa}", Object.fromEntries(A_HOSTLARI.map((h) => [`html|${h}`, { ogUrl: "apex/sayfa/{A}" }]))],
};
const YOK_YUVALARI = ["{B.duyuru}", "{B.sayfa}", "{B.sayfa-genel}", "{B.manset-ozel}", "{B.manset-duyuru}"];
// Kimlik kayitlari (olculen satirlar) — teshis "degisiklik yok" desin
const YENI_HEDEF = {
  "A.sayfa-genel": { id: "4c3451cf-cca3-4a22-bbea-1583f35b92d9", slug: "misyon-ve-vizyon" },
  "B.sayfa-genel": "YOK",
  "A.manset-ozel": { id: "3899e251-ebed-4e61-bc22-6952ed08a2e9", slug: null },
  "B.manset-ozel": "YOK",
  "A.manset-duyuru": { id: "f9335173-14e0-4b9f-930c-785c8a2cf683", slug: null },
  "B.manset-duyuru": "YOK",
};
const YENI_YOL = {
  "{A.sayfa-genel}": "/sayfa/misyon-ve-vizyon",
  "{A.manset-ozel}": "/manset/3899e251-ebed-4e61-bc22-6952ed08a2e9",
  "{A.manset-duyuru}": "/manset/f9335173-14e0-4b9f-930c-785c8a2cf683",
};
// Analog yuvalarin C3 kural sayilari (--ayrinti; bolum → adet) ve C3 bolum sayilari
const ANALOG_KURAL = { "{A.manset}": { "1": 47, "2": 50, "3": 14, "4": 12 }, "{A.sayfa}": { "1": 44, "2": 50, "3": 14, "4": 12 } };
const ANALOG_YONLENDIRME = { "{A.manset}": 3, "{A.sayfa}": 0 };
const BOLUM_C3 = { "0": 2, "1": 564, "2": 738, "3": 225, "4": 130, "5": 8, "6": 62, "7": 17 };

// ------------------------------------------------------------------------------
const gozlem = { ...girdi.gozlem };
const bolum = { ...BOLUM_C3 };
for (const [yeni, [analog, fark]] of Object.entries(FARK)) {
  let n = 0;
  for (const v of VARYANT) for (const h of HOSTLAR) {
    const kaynak = girdi.gozlem[`${v}|${h}|${analog}`];
    if (!kaynak) dur(`analog hucre yok: ${v}|${h}|${analog}`);
    const c = JSON.parse(JSON.stringify(kaynak));
    for (const [alan, deger] of Object.entries(fark[`${v}|${h}`] || {})) {
      if (!(alan in c)) dur(`analogda alan yok: ${v}|${h}|${analog}.${alan}`);
      c[alan] = deger;
    }
    const k = `${v}|${h}|${yeni}`;
    if (k in gozlem) dur(`hucre zaten var: ${k}`);
    gozlem[k] = c; n++;
  }
  if (n !== 28) dur(`${yeni}: ${n} hucre`);
  for (const b of ["1", "2", "3", "4"]) bolum[b] += ANALOG_KURAL[analog][b];
  // manset-ozel yonlendirmez → analogun yonlendirme kurallari yok
  if (yeni === "{A.manset-ozel}") bolum["1"] -= ANALOG_YONLENDIRME[analog];
}
for (const y of YOK_YUVALARI) for (const v of VARYANT) for (const h of HOSTLAR) {
  const k = `${v}|${h}|${y}`;
  if (k in gozlem) dur(`yer tutucu hucre zaten var: ${k}`);
  gozlem[k] = { hedef: "YOK" };
}
const sirali = Object.fromEntries(Object.keys(gozlem).sort().map((k) => [k, gozlem[k]]));
const belge = {
  ...girdi,
  kaydedildi: `TAHMIN (tahmin-uret-b4-c4.mjs, girdi ${girdi.kaydedildi})`,
  hedefler: { ...girdi.hedefler, ...YENI_HEDEF },
  semboller: { ...girdi.semboller, hedefYolu: { ...girdi.semboller.hedefYolu, ...YENI_YOL } },
  gozlem: sirali,
};
const metin = JSON.stringify(belge, null, 2) + "\n";
writeFileSync(new URL("tahmin-b4-c4-belge.json", DIZIN), metin);
const belgeSha = createHash("sha256").update(metin).digest("hex");
const toplam = Object.values(bolum).reduce((a, b) => a + b, 0);
const tahmin = {
  tur: "B4 C4 — eksik hedef yer tutucusu + asimetrik kapsama + uc yeni yuva",
  yazildi: new Date().toISOString(),
  not: `KODDAN ONCE uretildi (tahmin-uret-b4-c4.mjs). Kosu temel_belge'ye BIREBIR: ${Object.keys(sirali).length} hucre (515 + 84 yeni A + 140 yer tutucu), fark 0, FAIL 0, kapsama gecisi 0.`,
  temel_belge: { yol: "scripts/izolasyon-temel/tahmin-b4-c4-belge.json", sha256: belgeSha },
  fark_satirlari: [], yeni_hucreler: [], kayip_hucreler: [], kapsama_kaybi: [], kapsama_artti: [],
  beklenen_fail: [], beklenen_bilinen_kusur: {},
  bolum_sayilari_gecti: bolum,
  beklenen_sonuc_satiri: `SONUC: ${toplam} gecti, 0 kaldi (bilinen kusur: 0, temel cizgi farki: 0)`,
};
writeFileSync(new URL("tahmin-b4-c4.json", DIZIN), JSON.stringify(tahmin, null, 2) + "\n");
console.log(`hucre ${Object.keys(sirali).length} · ${tahmin.beklenen_sonuc_satiri} · bolum ${JSON.stringify(bolum)}`);
console.log(`belge sha256 ${belgeSha}`);
