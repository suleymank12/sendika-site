// K8 tahmini — KODDAN ONCE. Eski degerler temel cizgiden OKUNUR (yazim hatasi
// olmasin); YENI degerler bu dosyadaki ongorulerdir.
import { readFileSync, writeFileSync } from "node:fs";
const REPO = "D:/site/sendika-site";
const temel = JSON.parse(readFileSync(`${REPO}/scripts/izolasyon-temel/next-14.2.35.json`, "utf8"));
const g = temel.gozlem;
const H = "bilinmeyen-sub";
const farklar = [];
const ekle = (hucre, alan, yeni) => {
  if (!(hucre in g)) throw new Error(`temel cizgide yok: ${hucre}`);
  const eski = g[hucre][alan];
  if (JSON.stringify(eski) === JSON.stringify(yeni)) return; // degismiyorsa fark yok
  farklar.push({ hucre, alan, eski: eski === undefined ? "__undefined__" : eski, yeni: yeni === undefined ? "__undefined__" : yeni });
};
// (1) html: bugun default kurumun sitesini gosteren 6 public yol → notr 404 (layout'ta notFound)
const SITE_YOLLARI = ["/", "/haberler", "{A.duyuru}", "{A.haber}", "{A.manset}", "{A.sayfa}"];
for (const ya of SITE_YOLLARI) {
  const k = `html|${H}|${ya}`;
  ekle(k, "durum", 404);
  ekle(k, "kurumBaslik", "BULUNAMADI");
  ekle(k, "kurumOg", null);
  ekle(k, "ogUrl", null);
  ekle(k, "ogImage", null);
  // csp, slug, konum, tur DEGISMEZ (middleware calisiyor; 404 sayfasi nonce'lu)
  ekle(k, "konum", null); // ustteki "konum DEGISMEZ" {A.manset}'te yanlis: layout notFound sayfanin 307'sinden once gelir, Location yok (k8-on-analiz.md)
}
// robots / sitemap: getCurrentTenant → notFound() → route handler 404, govdesiz (content-type yok → tur "yok")
for (const [ya, eskiAlan] of [["/robots.txt", "robotsSitemap"], ["/sitemap.xml", "locHostlari"]]) {
  for (const v of ["html", "rsc", "prefetch"]) {
    const k = `${v}|${H}|${ya}`;
    ekle(k, "durum", 404);
    ekle(k, "tur", "yok");
    if (v === "html") ekle(k, eskiAlan, undefined);
  }
}
// (2) rsc: layout'ta notFound → HTTP 200 + NEXT_NOT_FOUND isareti, yukte kurum adi yok (K6 C4 olcumu)
for (const ya of SITE_YOLLARI) {
  const k = `rsc|${H}|${ya}`;
  ekle(k, "isaret", "notFound");
  ekle(k, "kurumlar", []);
}
for (const ya of ["{B.haber}", "{B.manset}"]) {
  ekle(`rsc|${H}|${ya}`, "kurumlar", []); // isaret zaten notFound (sayfa seviyesi) — degismez
}
// prefetch: dinamik sayfada layout render edilmiyor (C4) → robots/sitemap disinda DEGISMEZ

const satir = (f) => {
  const e = f.eski === "__undefined__" ? "undefined" : JSON.stringify(f.eski);
  const y = f.yeni === "__undefined__" ? "undefined" : JSON.stringify(f.yeni);
  return `~ ${f.hucre}.${f.alan}: ${e} → ${y}`;
};
const hucreler = [...new Set(farklar.map((f) => f.hucre))];
const tahmin = {
  tur: "K8 — bilinmeyen subdomain public tarafta notr 404",
  yazildi: new Date().toISOString(),
  not: `Kurallar K8 kodundan ONCE yazildi (ilk surum sha c3ecc828…). Sonradan TEK kural eklendi (html konum → null): kosudan ONCE yazili ongoruldu (k8-on-analiz.md, sha d597047c…), eksik kural duzeltmesi. Karsilastirilan temel cizgi dosyadan okunur: next-14.2.35.json (${Object.keys(g).length} hucre, kaydedildi ${temel.kaydedildi}, buildId ${temel.buildId}). Eski degerler temel cizgiden programla okundu, yeni degerler ongoru.`,
  varsayim: [
    "getCurrentTenant: 'unknown-slug' → notFound() (default'a dusus kalkar). Root metadata: found disindaki her durum → notr ('Sayfa Bulunamadı', noindex, og/twitter/description/metadataBase YOK).",
    "/admin/* DEGISMEZ: admin/layout generateMetadata unknown-slug'da bugunku 'Site Bulunamadı' metadata'sini aynen korur; govde AdminTenantBulunamadiView.",
    "Bilinmeyen CUSTOM domain DEGISMEZ (middleware 'default' yaziyor → found). Super admin host'u DEGISMEZ.",
    "Matris: bilinmeyen-sub host'u ZATEN VAR (yok-boyle-kurum.<apex>) — yeni host/hucre YOK. BEKLENEN['bilinmeyen-sub'] 'A' → null; kurallar notr beklentiye cevrilir."
  ],
  degisen_hucre_sayisi: hucreler.length,
  degisen_alan_sayisi: farklar.length,
  degisen_hucreler: hucreler,
  fark_satirlari: farklar.map(satir),
  yeni_hucreler: [],
  kayip_hucreler: [],
  degismeyecek: [
    "bilinmeyen-sub: /olmayan-sayfa, /apix, {B.haber}, {B.manset} html (zaten 404 BULUNAMADI og'suz); admin 3 yol + /super-admin; 16 sahte hucresi; prefetch'in robots/sitemap disindaki 14 hucresi",
    "apex, A-sub, B-sub, B-custom, bilinmeyen-custom, superadmin host'larinin HICBIR hucresi; (5) gorsel, (6) sinir, (7) api"
  ],
  kural_degisiklikleri: {
    "(1) bilinmeyen-sub": "74 → 71: kalkan baska-kurum-gorunmez 16, kendi-detay-acilir 4, og-* 18, capraz-detay-404 2, sitemap 1, robots 1 (=42); gelen kurum-gostermez 16, notr-404 12, notr-bas 10, admin-ekrani-korundu 1 (=39); sizinti-yok artik A ve B'yi sinar",
    "(2) bilinmeyen-sub": "96 → 106: baska-kurum-yok → kurum-yok (16+16), capraz-detay-notFound −2, yeni rsc notr-notFound +12"
  },
  beklenen_fail: [],
  beklenen_bilinen_kusur: {},
  bolum_sayilari_gecti: { "0": 2, "1": 559, "2": 738, "3": 225, "4": 130, "5": 8, "6": 62, "7": 17 },
  beklenen_sonuc_satiri: `SONUC: 1741 gecti, ${farklar.length} kaldi (bilinen kusur: 0, temel cizgi farki: ${farklar.length})`,
  kayit_sonrasi_sonuc_satiri: "SONUC: 1741 gecti, 0 kaldi (bilinen kusur: 0, temel cizgi farki: 0)",
  kayit_sonrasi_hucre: 515,
};
writeFileSync(`${REPO}/scripts/izolasyon-temel/tahmin-k8.json`, JSON.stringify(tahmin, null, 2) + "\n");
console.log(`hucre ${hucreler.length} · alan ${farklar.length}`);
console.log(tahmin.fark_satirlari.join("\n"));
