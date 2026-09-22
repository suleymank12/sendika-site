/**
 * PUBLIC DOGRULUK A3 TAHMIN URETECI — kurumsal sayfalar tek adreste (S1).
 *
 * KULLANIM (repo kokunden):  node scripts/izolasyon-temel/tahmin-uret-public-a3.mjs
 *   girdi: scripts/izolasyon-temel/next-14.2.35.json (B4 C4 kaydi)
 *   → tahmin-public-a3-belge.json (tam beklenen belge) + tahmin-public-a3.json (denetci)
 *
 * NE BEKLENIYOR:
 *   1) Mevcut 739 hucre AYNEN, uc alan haric: {A.sayfa} (/sayfa/hakkimizda)
 *      html hucrelerinde og:url artik /sayfa/<slug> — canonical'daki
 *      "kurumsal slug ise /kurumsal/<slug>" dali kalkti. A host'lari (apex,
 *      A-sub, bilinmeyen-custom): "apex/kurumsal/hakkimizda" → "apex/sayfa/{A}".
 *      (A.sayfa-genel zaten /sayfa/ idi; D5 "Sayfa Bulunamadı" basligi
 *      sablonla — "… | <kurum>" — kurum etiketi degismez.)
 *   2) Yeni yol /kurumsal/hakkimizda (7 host × 4 varyant = 28 hucre). ANALOG:
 *      {A.manset} — ayni sekilde kurumu cozup YONLENDIREN dinamik rota
 *      (manset/[id] → haber). ELLE yazilmis farklar (FARK tablosu):
 *        html|A host'lari: durum 307 → 308 (permanentRedirect), konum
 *          "/haberler/{A}" → "/sayfa/{A}", ogUrl "apex/manset/{A}" → null
 *          (yonlendirme sayfasi kendi metadata'sini uretmez; kok layout'unun
 *          openGraph'inda url yok — /olmayan-sayfa'daki gibi).
 *        B host'lari: B'de hakkimizda yok → notFound(); analogun B hucreleri
 *          de notFound (404 html / RSC isaret notFound) — fark yok.
 *        bilinmeyen-sub: K8 notr 404 — fark yok. superadmin: duz metin 404.
 *        rsc/prefetch/sahte: fark yok (RSC'de redirect/notFound isaretleri
 *          analogla ayni tur; prefetch dinamik rotada kurum tasimaz).
 *   3) KIMLIK: Adim 0'da olculen hedef degisimi belgeye yazilir
 *      (A.sayfa-genel → ai-egitimleri), teshis "degisiklik yok" demeli.
 *
 * KURAL SAYISI: analog {A.manset}'in (A2 build, --ayrinti) kurallari, eksi:
 *   bolum 1: A host'larinda `kendi-detay-acilir` (yol {A.…} degil → CAPRAZ yok)
 *            ve `og-url-host` (ogUrl null) → 3 × 2 = 6; B host'larinda
 *            `capraz-detay-404` → 2.  47 − 8 = 39.
 *   bolum 2: B host'larinda rsc `capraz-detay-notFound` → 2.  50 − 2 = 48.
 *   bolum 3: 14, bolum 4: 12.
 *   Bagimsiz ikinci turetme: /olmayan-sayfa (36/48/14/12) + A host'larinda
 *   `yonlendirme-kendi-kurumuna` (3) = 39/48/14/12 — ayni.
 *
 * Matrisin kodunu IMPORT ETMEZ. Tabloda olmayan durumda DURUR.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const DIZIN = new URL("./", import.meta.url);
const girdiMetin = readFileSync(new URL("next-14.2.35.json", DIZIN));
const GIRDI_SHA = "e7e0d0bf747d5337b467f286c6cdb4e706951f4508ecf3b07bd4ccd95c6b9e31";
const dur = (m) => { console.log(`DUR: ${m}`); process.exit(1); };
if (createHash("sha256").update(girdiMetin).digest("hex") !== GIRDI_SHA) dur("girdi temel cizgi beklenen dosya degil (sha)");
const girdi = JSON.parse(girdiMetin);

const HOSTLAR = ["apex", "A-sub", "B-sub", "B-custom", "bilinmeyen-sub", "bilinmeyen-custom", "superadmin"];
const VARYANT = ["html", "rsc", "prefetch", "sahte"];
const A_HOSTLARI = ["apex", "A-sub", "bilinmeyen-custom"];

// (1) mevcut hucrelerde degisen alanlar: hucre → { alan: [eski, yeni] }
const DEGISEN = Object.fromEntries(A_HOSTLARI.map((h) => [`html|${h}|{A.sayfa}`, { ogUrl: ["apex/kurumsal/hakkimizda", "apex/sayfa/{A}"] }]));

// (2) yeni yol → [analog yol, { "tur|host": { alan: [analogdaki, yeni] } }]
const YENI_YOL = "/kurumsal/hakkimizda";
const ANALOG = "{A.manset}";
const FARK = Object.fromEntries(A_HOSTLARI.map((h) => [`html|${h}`, { durum: [307, 308], konum: ["/haberler/{A}", "/sayfa/{A}"], ogUrl: ["apex/manset/{A}", null] }]));

// (3) kimlik: Adim 0'da olculen (KIMLIK teshisi, a0-kapi)
const YENI_HEDEF = { "A.sayfa-genel": { id: "0fb675f3-f44d-41ec-b9a1-92cb8de3bbde", slug: "ai-egitimleri" } };
const YENI_SEMBOL = { "{A.sayfa-genel}": "/sayfa/ai-egitimleri" };

// Kural sayilari
const BOLUM_ONCE = { "0": 4, "1": 699, "2": 888, "3": 267, "4": 166, "5": 8, "6": 62, "7": 17 };
const ANALOG_KURAL = { "1": 47, "2": 50, "3": 14, "4": 12 };
const EKSILEN = { "1": 8, "2": 2, "3": 0, "4": 0 };
const IKINCI_TURETME = { "1": 36 + 3, "2": 48, "3": 14, "4": 12 }; // /olmayan-sayfa + yonlendirme

// ------------------------------------------------------------------------------
const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const gozlem = JSON.parse(JSON.stringify(girdi.gozlem));
for (const [k, alanlar] of Object.entries(DEGISEN)) {
  if (!gozlem[k]) dur(`degisen hucre yok: ${k}`);
  for (const [a, [eski, yeni]] of Object.entries(alanlar)) {
    if (!esit(gozlem[k][a], eski)) dur(`${k}.${a} beklenen eski deger degil: ${JSON.stringify(gozlem[k][a])}`);
    gozlem[k][a] = yeni;
  }
}
let n = 0;
for (const v of VARYANT) for (const h of HOSTLAR) {
  const kaynak = girdi.gozlem[`${v}|${h}|${ANALOG}`];
  if (!kaynak) dur(`analog hucre yok: ${v}|${h}|${ANALOG}`);
  const c = JSON.parse(JSON.stringify(kaynak));
  for (const [a, [analogDeger, yeni]] of Object.entries(FARK[`${v}|${h}`] || {})) {
    if (!esit(c[a], analogDeger)) dur(`analog ${v}|${h}.${a} beklenen deger degil: ${JSON.stringify(c[a])}`);
    c[a] = yeni;
  }
  const k = `${v}|${h}|${YENI_YOL}`;
  if (k in gozlem) dur(`hucre zaten var: ${k}`);
  gozlem[k] = c; n++;
}
if (n !== 28) dur(`yeni hucre ${n}`);
const bolum = { ...BOLUM_ONCE };
for (const b of ["1", "2", "3", "4"]) {
  const yeni = ANALOG_KURAL[b] - EKSILEN[b];
  if (yeni !== IKINCI_TURETME[b]) dur(`bolum ${b}: iki turetme farkli (${yeni} ≠ ${IKINCI_TURETME[b]})`);
  bolum[b] += yeni;
}
const sirali = Object.fromEntries(Object.keys(gozlem).sort().map((k) => [k, gozlem[k]]));
const belge = {
  ...girdi,
  kaydedildi: `TAHMIN (tahmin-uret-public-a3.mjs, girdi ${girdi.kaydedildi})`,
  hedefler: { ...girdi.hedefler, ...YENI_HEDEF },
  semboller: { ...girdi.semboller, hedefYolu: { ...girdi.semboller.hedefYolu, ...YENI_SEMBOL } },
  gozlem: sirali,
};
const metin = JSON.stringify(belge, null, 2) + "\n";
writeFileSync(new URL("tahmin-public-a3-belge.json", DIZIN), metin);
const belgeSha = createHash("sha256").update(metin).digest("hex");
const toplam = Object.values(bolum).reduce((a, b) => a + b, 0);
const tahmin = {
  tur: "Public dogruluk A3 — kurumsal sayfalar tek adreste (/sayfa), eski adresler 308",
  yazildi: new Date().toISOString(),
  not: `KODDAN ONCE uretildi (tahmin-uret-public-a3.mjs). Kosu temel_belge'ye BIREBIR: ${Object.keys(sirali).length} hucre (739 + 28 yeni ${YENI_YOL}; 3 hucrede ogUrl → apex/sayfa/{A}), fark 0, FAIL 0, KIMLIK "degisiklik yok". Kural +113 (39/48/14/12).`,
  temel_belge: { yol: "scripts/izolasyon-temel/tahmin-public-a3-belge.json", sha256: belgeSha },
  temel_cizgiye_gore: {
    fark_satirlari: Object.entries(DEGISEN).flatMap(([k, al]) => Object.entries(al).map(([a, [e, y]]) => `~ ${k}.${a}: ${JSON.stringify(e)} → ${JSON.stringify(y)}`)),
    yeni_hucreler: HOSTLAR.flatMap((h) => VARYANT.map((v) => `${v}|${h}|${YENI_YOL}`)).sort(),
  },
  fark_satirlari: [], yeni_hucreler: [], kayip_hucreler: [], kapsama_kaybi: [], kapsama_artti: [],
  beklenen_fail: [], beklenen_bilinen_kusur: {},
  bolum_sayilari_gecti: bolum,
  beklenen_sonuc_satiri: `SONUC: ${toplam} gecti, 0 kaldi (bilinen kusur: 0, temel cizgi farki: 0)`,
};
writeFileSync(new URL("tahmin-public-a3.json", DIZIN), JSON.stringify(tahmin, null, 2) + "\n");
console.log(`hucre ${Object.keys(sirali).length} · ${tahmin.beklenen_sonuc_satiri} · bolum ${JSON.stringify(bolum)}`);
console.log(`belge sha256 ${belgeSha}`);
