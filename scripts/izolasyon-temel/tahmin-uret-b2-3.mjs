/**
 * B2 UYGULAMA 3 TAHMIN URETECI — bilinmeyen ozel alan adi notr 404 (B2).
 *
 * KULLANIM (repo kokunden):  node scripts/izolasyon-temel/tahmin-uret-b2-3.mjs
 *   girdi: next-14.2.35.json (public dogruluk A3 kaydi, 767 hucre)
 *          onolcum-b2-3.json (yeni yolun KOD DEGISMEDEN olculmus gozlemi)
 *   → tahmin-b2-3-belge.json (tam beklenen belge) + tahmin-b2-3.json (denetci)
 *
 * NE BEKLENIYOR (koddan ONCE, elle):
 *   1) bilinmeyen-custom'un 16 PUBLIC yolu × 4 varyant: ANALOG bilinmeyen-sub'in
 *      AYNI yoldaki hucresi (K8 notr 404 — ayni dal: unknown-slug), TEK fark
 *      `slug`: "{bilinmeyen-sub}" → "{bilinmeyen-alan}" (middleware isaret
 *      slug'i `!bilinmeyen-alan`). /admin ×3 ve /super-admin: DEGISMEZ
 *      (fail-closed yonlendirmesi slug yazilmadan once).
 *   2) Yeni yol /admin/tenant-bulunamadi (28 hucre): on olcum + FARK:
 *        kayitli host'lar (apex, A-sub, B-sub, B-custom): sayfa kurumu
 *          bulunca /admin/giris'e yonlendirir → html durum 200→307, konum
 *          null→"/admin/giris"; rsc isaret null→"redirect" (sayfa ici
 *          redirect RSC'de 200 + NEXT_REDIRECT — analog {A.manset}).
 *          prefetch degismez (dinamik sayfa govdesi prefetch'te render edilmez
 *          — analog prefetch|…|{A.manset} isaret null).
 *        bilinmeyen-custom: bilinmeyen-sub'in on olcum hucresi, slug →
 *          "{bilinmeyen-alan}" (isaret slug'i → admin layout notr ekran).
 *        bilinmeyen-sub, superadmin: degismez.
 *   3) Sembol tablosu: kurumSlug'a "{bilinmeyen-alan}": "!bilinmeyen-alan".
 *
 * KURAL SAYISI:
 *   bilinmeyen-custom 16 public yol: kendi kurallari (113/112/32/28) cikar,
 *     bilinmeyen-sub'in ayni yollardaki kurallari (78/112/32/28) girer
 *     (on olcum --ayrinti sayimi).
 *   Yeni yol, elle (matrisin YENI kural koduna gore):
 *     b1: superadmin 3 + kurumsuz 2×3 (sizinti, kurum-gostermez,
 *         bulunamadi-ekrani) + kayitli 4×3 (sizinti, baska-kurum-gorunmez,
 *         kayitli-hostta-girise) = 21
 *     b2: kayitli rsc 4×3 (icerik, baska-kurum-yok, girise-rsc) + prefetch
 *         4×2 + kurumsuz 2×(2+2) + superadmin 2×3 = 34
 *     b3: 7×2 = 14 · b4: html 6 × 2 = 12
 *
 * Matrisin kodunu IMPORT ETMEZ. Tabloda olmayan durumda DURUR.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const DIZIN = new URL("./", import.meta.url);
const dur = (m) => { console.log(`DUR: ${m}`); process.exit(1); };
const sha = (b) => createHash("sha256").update(b).digest("hex");
const girdiMetin = readFileSync(new URL("next-14.2.35.json", DIZIN));
if (sha(girdiMetin) !== "2e2564d12865af877af9abcae2a250d9032624e79c0a325f18761852efc06535") dur("girdi temel cizgi beklenen dosya degil (sha)");
const onMetin = readFileSync(new URL("onolcum-b2-3.json", DIZIN));
if (sha(onMetin) !== "49c6a3326ed8528da7d831fdb860e8781f2afa1b5d4fa9faa13793a3baba5495") dur("on olcum dosyasi beklenen dosya degil (sha)");
const girdi = JSON.parse(girdiMetin);
const on = JSON.parse(onMetin).hucreler;

const HOSTLAR = ["apex", "A-sub", "B-sub", "B-custom", "bilinmeyen-sub", "bilinmeyen-custom", "superadmin"];
const VARYANT = ["html", "rsc", "prefetch", "sahte"];
const KAYITLI = ["apex", "A-sub", "B-sub", "B-custom"];
const YENI = "/admin/tenant-bulunamadi";
const esit = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const kopya = (x) => JSON.parse(JSON.stringify(x));

const gozlem = kopya(girdi.gozlem);
// (1) bilinmeyen-custom public yollari ← bilinmeyen-sub analogu
const yollar = [...new Set(Object.keys(gozlem).filter((k) => k.startsWith("html|bilinmeyen-custom|")).map((k) => k.split("|")[2]))];
const publicYollar = yollar.filter((y) => !y.startsWith("/admin") && y !== "/super-admin" && gozlem[`html|bilinmeyen-custom|${y}`].hedef !== "YOK");
if (publicYollar.length !== 16) dur(`public yol ${publicYollar.length} (16 bekleniyordu)`);
const slugDegistir = (c) => {
  if (c.hedef === "YOK" || !("slug" in c)) return c;
  if (c.slug !== "{bilinmeyen-sub}") dur(`analog slug beklenmedik: ${JSON.stringify(c)}`);
  return { ...c, slug: "{bilinmeyen-alan}" };
};
let degisen = 0;
for (const y of publicYollar) for (const v of VARYANT) {
  const hedef = `${v}|bilinmeyen-custom|${y}`, analog = `${v}|bilinmeyen-sub|${y}`;
  if (!gozlem[analog]) dur(`analog yok: ${analog}`);
  const yeni = slugDegistir(kopya(gozlem[analog]));
  if (!esit(yeni, gozlem[hedef])) degisen++;
  gozlem[hedef] = yeni;
}
// (2) yeni yol
const FARK = {};
for (const h of KAYITLI) {
  FARK[`html|${h}`] = { durum: [200, 307], konum: [null, "/admin/giris"] };
  FARK[`rsc|${h}`] = { isaret: [null, "redirect"] };
}
for (const v of VARYANT) for (const h of HOSTLAR) {
  const k = `${v}|${h}|${YENI}`;
  if (k in gozlem) dur(`hucre zaten var: ${k}`);
  let c;
  if (h === "bilinmeyen-custom") c = slugDegistir(kopya(on[`${v}|bilinmeyen-sub|${YENI}`]));
  else c = kopya(on[k]);
  if (!c) dur(`on olcum hucresi yok: ${k}`);
  for (const [a, [eski, yeni]] of Object.entries(FARK[`${v}|${h}`] || {})) {
    if (!esit(c[a], eski)) dur(`${k}.${a} on olcumde beklenen deger degil: ${JSON.stringify(c[a])}`);
    c[a] = yeni;
  }
  gozlem[k] = c;
}
// (3) kural sayisi
const BOLUM_ONCE = { "0": 4, "1": 738, "2": 936, "3": 281, "4": 178, "5": 8, "6": 62, "7": 17 };
const CUSTOM_ESKI = { "1": 113, "2": 112, "3": 32, "4": 28 };
const SUB_ANALOG = { "1": 78, "2": 112, "3": 32, "4": 28 };
const YENI_YOL = { "1": 21, "2": 34, "3": 14, "4": 12 };
const bolum = { ...BOLUM_ONCE };
for (const b of ["1", "2", "3", "4"]) bolum[b] += -CUSTOM_ESKI[b] + SUB_ANALOG[b] + YENI_YOL[b];

const sirali = Object.fromEntries(Object.keys(gozlem).sort().map((k) => [k, gozlem[k]]));
const belge = {
  ...girdi,
  kaydedildi: `TAHMIN (tahmin-uret-b2-3.mjs, girdi ${girdi.kaydedildi})`,
  semboller: { ...girdi.semboller, kurumSlug: { ...girdi.semboller.kurumSlug, "{bilinmeyen-alan}": "!bilinmeyen-alan" } },
  gozlem: sirali,
};
const metin = JSON.stringify(belge, null, 2) + "\n";
writeFileSync(new URL("tahmin-b2-3-belge.json", DIZIN), metin);
const toplam = Object.values(bolum).reduce((a, b) => a + b, 0);
const tahmin = {
  tur: "B2 uygulama 3 — bilinmeyen ozel alan adi notr 404, veritabani hatasi 503",
  yazildi: new Date().toISOString(),
  not: `KODDAN ONCE uretildi (tahmin-uret-b2-3.mjs). Kosu temel_belge'ye BIREBIR: ${Object.keys(sirali).length} hucre (767 + 28 yeni ${YENI}; bilinmeyen-custom public ${degisen} hucre bilinmeyen-sub analoguna), fark 0, FAIL 0, KIMLIK 'degisiklik yok'.`,
  temel_belge: { yol: "scripts/izolasyon-temel/tahmin-b2-3-belge.json", sha256: sha(metin) },
  fark_satirlari: [], yeni_hucreler: [], kayip_hucreler: [], kapsama_kaybi: [], kapsama_artti: [],
  beklenen_fail: [], beklenen_bilinen_kusur: {},
  bolum_sayilari_gecti: bolum,
  beklenen_sonuc_satiri: `SONUC: ${toplam} gecti, 0 kaldi (bilinen kusur: 0, temel cizgi farki: 0)`,
};
writeFileSync(new URL("tahmin-b2-3.json", DIZIN), JSON.stringify(tahmin, null, 2) + "\n");
console.log(`hucre ${Object.keys(sirali).length} · degisen custom ${degisen} · ${tahmin.beklenen_sonuc_satiri} · bolum ${JSON.stringify(bolum)}`);
console.log(`belge sha256 ${tahmin.temel_belge.sha256}`);
