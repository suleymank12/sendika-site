/**
 * IZOLASYON HEDEF SECIMI — matris (scripts/test-izolasyon-matrisi.mjs) ve
 * veri kapisi (veri-kontrol.mjs) AYNI secimi buradan alir (B4, 22 Eylul 2026).
 *
 * NEDEN (olculdu, raporlar/2026-09-22-0125-b4-canli-veri-bagimliligi.md):
 *   - `pages` ve `headlines` sorgularinda ORDER yoktu → Postgres fiziksel sirasi.
 *     Paneldeki bir kayit o sirayi degistirdi ve {A.manset} ozel manseten
 *     (200) haber kaynakli mansete (307) kaydi: iki tur DUR.
 *   - `published_at.desc` NULL'lari BASA koyar (Postgres) — yayin tarihi bos
 *     bir haber her zaman hedef olurdu.
 *   - B "custom domain'li aktif kurumlar arasinda slug'a gore ilk" idi:
 *     alfabetik olarak once gelen yeni bir musteri 127/515 hucreyi degistirirdi.
 *
 * KARAR:
 *   P1 belirlenimci sira — ANLAM AYNI (en yeni haber/duyuru, en eski sayfa,
 *      sitenin slider sirasi) + id esitlik bozucu. Olcum: 6/6 hedef bugunku
 *      satiri seciyor, tek seferlik kayma yok.
 *   P2 sinif sabitleme — hedefin DAVRANIS sinifi filtreyle sabit: manset
 *      yuvasi yalniz haber kaynakli (307 → haber), sayfa yuvasi yalniz
 *      SAYFA_SINIF_SLUGLARI (eski kurumsal slug listesi). Siniflar arasi
 *      gecis artik hedef degistirmez.
 *   P6 sabit B — temel cizgide kayitli kurum ID'si; kullanilamazsa HATA
 *      (sessiz gecis yok). Yeni B yalniz `--b-kurum <id>` + kayitla.
 */
import { existsSync, readdirSync } from "node:fs";

/**
 * SAYFA SINIF LISTESI — aracin KENDI dondurulmus kopyasi (23 Eylul 2026).
 *
 * Eskiden `src/lib/constants.ts`'teki `KURUMSAL_PAGE_SLUGS` import ediliyordu.
 * Urun o kavrami kaldiriyor (ayni turun sonraki commit'i: kurumsal sayfa
 * rotalari kalkar, her sayfa tek adreste /sayfa/<slug>; eski
 * /kurumsal/<slug> adresleri 308). Bagimsizlik
 * ilkesi (B4): arac urunun normalizasyon kodunu import etmedigi gibi urunun
 * KAVRAM tanimlarini da import etmez — urun bir kavrami kaldirinca ya da
 * genisletince test araci sessizce anlam degistirmemeli, hedef satiri
 * kaymamali.
 *
 * Anlami: `sayfa` / `sayfa-genel` yuvalari bu slug'larla AYRILIR. Liste
 * 22 Eylul 2026'daki urun sabitinin birebir kopyasi; degistirmek hedef
 * secimini degistirir → yalniz kilitli tahminle (NOTE.md "🔑 K8" kurali).
 * Degisiklik anindaki kanit: tahmin-public-a2.json (veri ozeti sha'si ayni,
 * 0 hucre farki).
 */
export const SAYFA_SINIF_SLUGLARI = Object.freeze(["hakkimizda", "tuzuk", "misyon-vizyon"]);

// Kolonlar: matrisin ve veri kapisinin ihtiyacinin birlesimi. Sira = ORDER.
export const SORGULAR = {
  haber: "news?select=id,slug,title,tenant_id,cover_image,updated_at&is_published=eq.true&order=published_at.desc.nullslast,id.asc",
  duyuru: "announcements?select=id,slug,title,tenant_id,updated_at&is_published=eq.true&order=published_at.desc.nullslast,id.asc",
  sayfa: "pages?select=id,slug,title,tenant_id,updated_at&is_published=eq.true&order=created_at.asc,id.asc",
  manset: "headlines?select=id,title,tenant_id,source_type,source_id,link_url,order,created_at&is_active=eq.true&order=order.asc,created_at.asc,id.asc",
};

// Hedef yuvalari: liste + sinif kosulu + istek yolu. Sira = matristeki yol sirasi.
// Her DAVRANIS sinifinin kendi yuvasi var (P2): sinif filtresi disarida kalan
// sinifi korlestirmesin diye. Veride karsiligi yoksa yuva YOK yer tutucusudur
// (P7) — kirmizi degil; icerik eklenince kapsama kendiliginden artar.
//   manset         haber kaynakli → 307 haber detayi
//   manset-ozel    ozel (source_type "custom") → 200, kendi sayfasi
//   manset-duyuru  duyuru kaynakli → 307 duyuru detayi
//   sayfa          SAYFA_SINIF_SLUGLARI'ndaki slug (eski kurumsal sayfalar)
//   sayfa-genel    listede OLMAYAN /sayfa/<slug>
export const YUVALAR = [
  ["haber", "haber", (x) => !!x.cover_image, (x) => `/haberler/${x.slug}`],
  ["duyuru", "duyuru", () => true, (x) => `/duyurular/${x.slug}`],
  ["sayfa", "sayfa", (x) => SAYFA_SINIF_SLUGLARI.includes(x.slug), (x) => `/sayfa/${x.slug}`],
  ["manset", "manset", (x) => x.source_type === "news", (x) => `/manset/${x.id}`],
  ["sayfa-genel", "sayfa", (x) => !SAYFA_SINIF_SLUGLARI.includes(x.slug), (x) => `/sayfa/${x.slug}`],
  ["manset-ozel", "manset", (x) => x.source_type === "custom", (x) => `/manset/${x.id}`],
  ["manset-duyuru", "manset", (x) => x.source_type === "announcement", (x) => `/manset/${x.id}`],
];

export async function listeleriOku(supa) {
  const [haber, duyuru, sayfa, manset] = await Promise.all([supa(SORGULAR.haber), supa(SORGULAR.duyuru), supa(SORGULAR.sayfa), supa(SORGULAR.manset)]);
  return { haber, duyuru, sayfa, manset };
}

/** { "A.haber": satir|null, "B.haber": …, … } — her kurum icin her yuvanin ilk uygun satiri. */
export function hedefleriSec(listeler, A, B) {
  const out = {};
  for (const [ad, liste, kosul] of YUVALAR) {
    for (const [ke, k] of [["A", A], ["B", B]]) {
      out[`${ke}.${ad}`] = listeler[liste].find((x) => x.tenant_id === k.id && kosul(x)) ?? null;
    }
  }
  return out;
}
export const hedefYolu = (anahtar, satir) => (satir ? YUVALAR.find(([ad]) => ad === anahtar.split(".")[1])[3](satir) : null);

// ---------------------------------------------------------------------------
// Temel cizgi secimi (karsilastirma hedefi) — sabit B de buradan okunur
// ---------------------------------------------------------------------------
export const surumSirala = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
/** IZOLASYON_TEMEL → kurulu Next surumunun dosyasi → ondan KUCUK en buyuk surum. URL ya da null. */
export function temelSec(temelDizin, nextSurum, env = process.env) {
  if (env.IZOLASYON_TEMEL) return new URL(env.IZOLASYON_TEMEL, `file://${process.cwd().replace(/\\/g, "/")}/`);
  if (!existsSync(temelDizin)) return null;
  const surumler = readdirSync(temelDizin).map((f) => (f.match(/^next-(\d+\.\d+\.\d+)\.json$/) || [])[1]).filter(Boolean).sort(surumSirala);
  if (surumler.includes(nextSurum)) return new URL(`next-${nextSurum}.json`, temelDizin);
  const once = surumler.filter((s) => surumSirala(s, nextSurum) < 0).pop();
  return once ? new URL(`next-${once}.json`, temelDizin) : null;
}

/**
 * Sabit B (P6). `acik`: --b-kurum ile verilen id. Yoksa temel cizgideki kayit
 * (yeni bicim {id, slug}; eski bicim yalniz slug dizgisi). Donus:
 * { B } ya da { hata } — hata varsa cagiran KIRMIZI cikar, baska kuruma gecmez.
 */
export function sabitBSec(kurumlar, temelBelge, acik) {
  const kayit = acik ? { id: acik } : temelBelge?.kurumlar?.B;
  if (!kayit) return { hata: "temel cizgide B kaydi yok — `--b-kurum <id> --kaydet --uzerine-yaz` ile acikca secin" };
  const ref = typeof kayit === "string" ? { slug: kayit } : kayit;
  const B = kurumlar.find((k) => (ref.id ? k.id === ref.id : k.slug === ref.slug));
  if (!B) return { hata: `sabit B kurumu bulunamadi (${ref.id ?? ref.slug})` };
  if (B.slug === "default") return { hata: "sabit B default kurum olamaz" };
  if (!B.is_active) return { hata: `sabit B kurumu PASIF (${B.slug})` };
  if (!B.custom_domain) return { hata: `sabit B kurumunun custom domain'i YOK (${B.slug})` };
  return { B };
}
