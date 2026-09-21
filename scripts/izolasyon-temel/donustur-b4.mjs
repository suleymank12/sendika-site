/**
 * B4 C3 TAHMIN DONUSTURUCUSU — mevcut temel cizgiyi (next-14.2.35.json, C2
 * kaydi) B4 normalizasyonunun BEKLENEN bicimine cevirir. Cikti tahmindir:
 * matris kosusu bu belgeye BIREBIR uymak zorunda (IZOLASYON_TEMEL ile).
 *
 * KULLANIM (repo kokunden):  node scripts/izolasyon-temel/donustur-b4.mjs
 *   → scripts/izolasyon-temel/tahmin-b4-c3-belge.json  (tam beklenen belge)
 *   → scripts/izolasyon-temel/tahmin-b4-c3.json        (denetci bicimi)
 *
 * 🔴 BAGIMSIZLIK: bu dosya matrisin normalizasyon kodunu IMPORT ETMEZ.
 * Matris ham HTTP yanitindan + canli sahiplik haritasindan, bu dosya eski
 * SEMBOLIK degerlerden + ELLE yazilmis sabit tablodan ayni sonuca ayri
 * yoldan varir. Ayni kod iki tarafta olsaydi bir hata iki tarafa da yansir
 * ve "birebir" totoloji olurdu.
 *
 * 🔴 SESSIZ GECIS YOK: tabloda olmayan bir sembol, ham icerik yolu, bilinmeyen
 * slug ya da "?(" baslik gorurse DURUR (cikis 1) — tahmin uretilmez.
 *
 * Normalizasyon (B4 tasarimi, raporlar/2026-09-22-0125-b4-canli-veri-bagimliligi.md):
 *   P3 icerik yolu → sahip jetonu: "/haberler/<slug>" → "/haberler/{A}" (konum, ogUrl)
 *   P4 x-tenant-slug → sembol: "default" → "{A.slug}" (html/rsc/prefetch/sinir slug)
 *   P5 kurumBaslik "?(<metin>)" → icerik sahibi (bugun 0 hucre; gorulurse DUR)
 *   Kural: + `yonlendirme-kendi-kurumuna` (bolum 1) — konumunda icerik jetonu
 *   olan her html hucresi icin bir kural.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const DIZIN = new URL("./", import.meta.url);
const GIRDI = new URL("next-14.2.35.json", DIZIN);
const BELGE_AD = "tahmin-b4-c3-belge.json";
const TAHMIN_AD = "tahmin-b4-c3.json";

// --- ELLE YAZILMIS TABLOLAR (tahminin kendisi) --------------------------------
// Eski hedef sembolu → yeni icerik yolu (sahip jetonu). Hedef yuvasinin sahibi
// yuva adindan bellidir ({A.*} A'nin satiri, {B.*} B'nin satiri).
const HEDEF_SEMBOLU = {
  "{A.haber}": "/haberler/{A}",
  "{B.haber}": "/haberler/{B}",
  "{A.duyuru}": "/duyurular/{A}",
  "{A.sayfa}": "/sayfa/{A}",
  "{A.manset}": "/manset/{A}",
  "{B.manset}": "/manset/{B}",
};
// x-tenant-slug ham degeri → sembol (temel cizgideki kurumlar: A=default, B=kurmay-teknoloji)
const SLUG_SEMBOLU = { default: "{A.slug}", "kurmay-teknoloji": "{B.slug}", "yok-boyle-kurum": "{bilinmeyen-sub}" };
// Degismeden kalan (icerik tasimayan) bilinen degerler — kod rotalari, host etiketleri
const KOD_KONUMU = new Set(["/admin/giris?next=%2Fadmin", "/admin/giris?next=%2Fadmin%2Fhaberler", "/admin/tenant-bulunamadi", "/super-admin", "/super-admin/giris?next=%2Fsuper-admin"]);
const KOD_OGURL = new Set(["apex/", "apex/haberler", "apex/kurumsal/hakkimizda", "B-custom/", "B-custom/haberler"]);
const OG_HOSTLARI = ["apex", "B-custom"];
// Konumunda icerik jetonu olan html hucresi → yeni kural (bolum 1)
const ICERIK_JETONU = /\/(?:haberler|duyurular|sayfa|manset)\/\{[^}]+\}/;
// Matrisin bugunku bolum gecti sayilari (C2 kapisi, 1741)
const BOLUM_ONCE = { "0": 2, "1": 559, "2": 738, "3": 225, "4": 130, "5": 8, "6": 62, "7": 17 };

// ------------------------------------------------------------------------------
const dur = (m) => { console.log(`DUR: ${m}`); process.exit(1); };
const girdi = JSON.parse(readFileSync(GIRDI, "utf8"));
const sayac = { konum: 0, ogUrl: 0, slug: 0 };

function konumCevir(v, yer) {
  if (v === null || KOD_KONUMU.has(v)) return v;
  if (v in HEDEF_SEMBOLU) { sayac.konum++; return HEDEF_SEMBOLU[v]; }
  return dur(`tabloda olmayan konum: ${yer} = ${JSON.stringify(v)}`);
}
function ogUrlCevir(v, yer) {
  if (v === null || KOD_OGURL.has(v)) return v;
  for (const h of OG_HOSTLARI) {
    if (v.startsWith(h) && v.slice(h.length) in HEDEF_SEMBOLU) { sayac.ogUrl++; return h + HEDEF_SEMBOLU[v.slice(h.length)]; }
  }
  return dur(`tabloda olmayan ogUrl: ${yer} = ${JSON.stringify(v)}`);
}
function slugCevir(v, yer) {
  if (v === null) return v;
  if (v in SLUG_SEMBOLU) { sayac.slug++; return SLUG_SEMBOLU[v]; }
  return dur(`tabloda olmayan slug: ${yer} = ${JSON.stringify(v)}`);
}

const gozlem = {};
let yeniKural = 0;
for (const [k, c0] of Object.entries(girdi.gozlem)) {
  const tur = k.split("|")[0];
  const c = { ...c0 };
  if (["html", "rsc", "prefetch", "sinir"].includes(tur) && "slug" in c) c.slug = slugCevir(c.slug, `${k}.slug`);
  if (["html", "rsc", "prefetch", "sinir"].includes(tur) && "konum" in c) c.konum = konumCevir(c.konum, `${k}.konum`);
  if (["html", "sinir"].includes(tur) && "ogUrl" in c) c.ogUrl = ogUrlCevir(c.ogUrl, `${k}.ogUrl`);
  for (const f of ["kurumBaslik", "kurumOg"]) if (typeof c[f] === "string" && c[f].startsWith("?(")) dur(`"?(" baslik — tabloda karsiligi yok: ${k}.${f}`);
  // ogImage/robotsSitemap/locHostlari: icerik yolu tasimiyor (olculdu) — aynen; yine de sinanir
  for (const f of ["ogImage", "robotsSitemap"]) if (typeof c[f] === "string" && /\{[^}]+\}|\/(haberler|duyurular|sayfa|manset)\//.test(c[f])) dur(`beklenmeyen icerik yolu: ${k}.${f} = ${c[f]}`);
  if (tur === "html" && typeof c.konum === "string" && ICERIK_JETONU.test(c.konum)) yeniKural++;
  gozlem[k] = c;
}

const belge = { ...girdi, kaydedildi: `TAHMIN (donustur-b4.mjs, girdi ${girdi.kaydedildi})`, gozlem };
const belgeMetni = JSON.stringify(belge, null, 2) + "\n";
writeFileSync(new URL(BELGE_AD, DIZIN), belgeMetni);
const belgeSha = createHash("sha256").update(belgeMetni).digest("hex");

const bolum = { ...BOLUM_ONCE, "1": BOLUM_ONCE["1"] + yeniKural };
const toplam = Object.values(bolum).reduce((a, b) => a + b, 0);
const tahmin = {
  tur: "B4 C3 — icerik yolu sahip jetonu + slug sembolu + baslik geri dusumu",
  yazildi: new Date().toISOString(),
  not: `KODDAN ONCE uretildi (donustur-b4.mjs). Kosu temel_belge'ye BIREBIR uymali (IZOLASYON_TEMEL): fark 0, FAIL 0. Degisen alan: konum ${sayac.konum}, ogUrl ${sayac.ogUrl}, slug ${sayac.slug}. Yeni kural yonlendirme-kendi-kurumuna: ${yeniKural} (bolum 1). kendi-detay-acilir kosulu degisti (sayi ayni).`,
  temel_belge: { yol: `scripts/izolasyon-temel/${BELGE_AD}`, sha256: belgeSha },
  fark_satirlari: [],
  yeni_hucreler: [],
  kayip_hucreler: [],
  beklenen_fail: [],
  beklenen_bilinen_kusur: {},
  bolum_sayilari_gecti: bolum,
  beklenen_sonuc_satiri: `SONUC: ${toplam} gecti, 0 kaldi (bilinen kusur: 0, temel cizgi farki: 0)`,
};
writeFileSync(new URL(TAHMIN_AD, DIZIN), JSON.stringify(tahmin, null, 2) + "\n");
console.log(`hucre ${Object.keys(gozlem).length} · degisen alan: konum ${sayac.konum}, ogUrl ${sayac.ogUrl}, slug ${sayac.slug} · yeni kural ${yeniKural} · ${tahmin.beklenen_sonuc_satiri}`);
console.log(`belge sha256 ${belgeSha}`);
