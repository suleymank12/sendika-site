/**
 * KAPAK GORSELI YUKLEME DENEYIMI testi — 21 Eylul 2026.
 *
 * CALISTIRMA:
 *   npm run test:share-image
 *   (= node scripts/test-share-image.mjs)
 *
 * ## DURUM NEYDI (teshis, olcumle)
 *
 * raporlar/2026-09-21-0137-kapak-gorseli-yukleme-teshis.md — canli Storage'daki
 * 25 gorsel kaydi olculdu. Iki ayri sorun bulundu:
 *
 *   1. ORAN: 9 haber kapaginin 4'u 1,91:1 cercevede %45'ten fazla alan
 *      kaybediyor (0,67 / 0,76 / 0,46 / 3,59).
 *   2. 🔴 OLCU: bizim kendi boru hattimiz dikey kapaklari KUCULTUYORDU.
 *      MediaSection kapak icin 1200x675 "kutuya sigdir" veriyordu; dikey bir
 *      kaynak yuksekliğe carpip genisligi eriyordu. Canli olcumde 311x675
 *      cikan kapak tam olarak buydu — Facebook'un belgeledigi 600x315
 *      esiginin ALTINDA, yani paylasimda "much smaller" onizleme.
 *
 * Ve panelde kullanici bunlarin HICBIRINI goremiyordu: yukleme kutusunun
 * onizlemesi `object-cover` idi, yani 3648x5472 dikey bir fotograf orada
 * duzgun yatay bir serit gibi gorunuyordu — sorunu GIZLIYORDU.
 *
 * ## BU TEST NEYI DOGRULAR
 *
 *   (a) lib/share-image.ts sabitleri — Facebook belgesindeki sayilar
 *   (b) gorselYonu / olcuMetni
 *   (c) degerlendir — esikler, uyari BIRIKIMI, gecersiz olcu
 *   (d) 🔴 ADIM 0 — paylasimi besleyen DORT kutuda da maxHeight YOK
 *       (haber/duyuru/sayfa kapagi, manset, galeri albumu x2); dokunulmayan
 *       kutularin sinirlari ise KORUNDU
 *   (e) 🔴 ImageUploader onizlemesi object-contain (artik yalan soylemiyor)
 *   (f) SharePreview — 1,91:1 cerceve + etiket + "olculemedi" durumu
 *   (g) Cagri noktalari: paylasimi besleyen 4 kutuda ACIK, digerlerinde KAPALI
 *   (h) Yonlendirme metinleri (1200x630) ve logo notu
 *   (i) Yonetim kurulu 600x750 (ayni oran, esigi geciyor)
 *   (j) sayfa/[slug] kendi kapagini og:image'a GECIRIYOR (madde 9/1)
 *   (k) 🔴 Cok kiracili: paylasim onizlemesi hicbir kurum verisine bakmiyor
 *
 * ## ADIM 0'IN OLCULEN ETKISI (gercek dosyalar, sharp ile)
 *
 * KAPAK + GALERI ALBUMU (eski 1200x675 kutu -> yeni: genislik 1200, yuk. serbest)
 *   kaynak       ESKI       og ucu    esik   ||  YENI        og ucu     esik
 *   3648x5472 -> 450x675    450x675   KALIR  ||  1200x1800   1200x1800  GECER
 *   2813x3679 -> 516x675    516x675   KALIR  ||  1200x1569   1200x1569  GECER
 *   5712x4284 -> 900x675    900x675   GECER  ||  1200x900    1200x900   GECER
 *   5473x3654 -> 1011x675   1011x675  GECER  ||  1200x801    1200x801   GECER
 *
 * MANSET (eski 1400x600 kutu -> yeni: genislik 1400, yukseklik serbest)
 *   3648x5472 -> 400x600    400x600   KALIR  ||  1400x2100   1200x1800  GECER
 *   2813x3679 -> 459x600    459x600   KALIR  ||  1400x1831   1200x1569  GECER
 *   5712x4284 -> 800x600    800x600   GECER  ||  1400x1050   1200x900   GECER
 *   5473x3654 -> 899x600    899x600   GECER  ||  1400x935    1200x801   GECER
 *
 * ## MANSET SERIDININ SITEDEKI CERCEVESI (Playwright, canli dev sunucu)
 *
 *   390px ekran  -> 350x350  (oran 1.00)
 *   1249px       -> 645x450  (1.43)
 *   1440px       -> 816x450  (1.81)
 *   1920px       -> 987x450  (2.19)
 *
 * Yani TEK BIR ORAN YOK. 1400x600 (2.33) hicbirine karsilik gelmiyor ve
 * olculen bandin disinda; 1200x630 (1.91) hem paylasim cercevesine tam
 * oturuyor hem bandin ortasinda. Oneri bu yuzden 1200x630'a cekildi.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir.
 */

import { readFileSync } from "node:fs";
import {
  MAX_ORAN,
  MIN_ORAN,
  MIN_PAYLASIM_GENISLIK,
  MIN_PAYLASIM_YUKSEKLIK,
  ONERILEN_GENISLIK,
  ONERILEN_YUKSEKLIK,
  PAYLASIM_ORANI,
  degerlendir,
  gorselYonu,
  olcuMetni,
} from "../src/lib/share-image.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (diger test script'leriyle ayni desen)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi   : ${input}`);
    console.log(`          cikti   : ${a}`);
    console.log(`          beklenen: ${e}`);
  }
}

function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}

function header(title) {
  console.log("");
  console.log(`--- ${title}`);
}

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

/** Yorum satirlarini eler — muhurler YORUMDAN degil KODDAN okunmali. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

/**
 * Bir JSX etiketinin acilisini (proplariyla birlikte) dondurur.
 *
 * 🔴 Naif `indexOf(">")` KULLANILMAZ: `onChange={(url) => ...}` icindeki ok
 * isareti etiketi erken kesiyordu ve testler sessizce yanlis parca uzerinde
 * kosuyordu. Suslu parantez derinligi sayilir; kapanis `>` yalniz derinlik
 * 0'da kabul edilir.
 */
function tagAt(src, from) {
  let derinlik = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === "{") derinlik++;
    else if (c === "}") derinlik--;
    else if (c === ">" && derinlik === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}

function tag(src, name) {
  const i = src.indexOf(`<${name}`);
  return i === -1 ? "" : tagAt(src, i);
}

/** Bir JSX etiketinin TUM gecislerini dondurur. */
function tags(src, name) {
  const out = [];
  let from = 0;
  for (;;) {
    const i = src.indexOf(`<${name}`, from);
    if (i === -1) break;
    const t = tagAt(src, i);
    out.push(t);
    from = i + t.length;
  }
  return out;
}

const SHARE_LIB = "src/lib/share-image.ts";
const PREVIEW = "src/components/admin/SharePreview.tsx";
const UPLOADER = "src/components/admin/ImageUploader.tsx";
const MEDIA = "src/components/admin/MediaSection.tsx";
const MANSET = "src/app/admin/(authenticated)/manset/page.tsx";
const GALERI = "src/app/admin/(authenticated)/galeri/page.tsx";
const GALERI_ID = "src/app/admin/(authenticated)/galeri/[id]/page.tsx";
const AYARLAR = "src/app/admin/(authenticated)/ayarlar/page.tsx";
const YONETIM = "src/app/admin/(authenticated)/yonetim-kurulu/page.tsx";
const SLIDER = "src/app/admin/(authenticated)/slider/page.tsx";
const BOLUM = "src/app/admin/(authenticated)/anasayfa-bolumleri/[id]/page.tsx";
const SUBELER = "src/app/admin/(authenticated)/subeler/page.tsx";
const SAYFA = "src/app/(public)/sayfa/[slug]/page.tsx";
const HABER = "src/app/(public)/haberler/[slug]/page.tsx";
const DUYURU = "src/app/(public)/duyurular/[slug]/page.tsx";
const ALBUM = "src/app/(public)/galeri/[albumId]/page.tsx";
const MANSET_PUBLIC = "src/app/(public)/manset/[id]/page.tsx";

// ===========================================================================
header("(a) Sabitler — Facebook belgesindeki sayilar");
// ===========================================================================
// developers.facebook.com/docs/sharing/webmasters/images (21 Eylul 2026):
//   "at least 1200 x 630" · "At the minimum ... 600 x 315" · "1.91:1"
ok("a", "onerilen genislik 1200", ONERILEN_GENISLIK, 1200, "belge");
ok("a", "onerilen yukseklik 630", ONERILEN_YUKSEKLIK, 630, "belge");
ok("a", "alt sinir genislik 600", MIN_PAYLASIM_GENISLIK, 600, "belge");
ok("a", "alt sinir yukseklik 315", MIN_PAYLASIM_YUKSEKLIK, 315, "belge");
ok("a", "paylasim orani 1.91", PAYLASIM_ORANI, 1.91, "belge");
ok("a", "oran alt bandi 1.4", MIN_ORAN, 1.4, "tasarim karari");
ok("a", "oran ust bandi 2.5", MAX_ORAN, 2.5, "tasarim karari");
okTrue(
  "a",
  "onerilen olcu 1.91:1'e yakin",
  Math.abs(ONERILEN_GENISLIK / ONERILEN_YUKSEKLIK - PAYLASIM_ORANI) < 0.02,
  "1200/630"
);
okTrue(
  "a",
  "onerilen olcu alt siniri asiyor",
  ONERILEN_GENISLIK >= MIN_PAYLASIM_GENISLIK && ONERILEN_YUKSEKLIK >= MIN_PAYLASIM_YUKSEKLIK,
  "1200x630 vs 600x315"
);

// ===========================================================================
header("(b) gorselYonu / olcuMetni");
// ===========================================================================
ok("b", "yatay", gorselYonu({ width: 1200, height: 630 }), "yatay", "1200x630");
ok("b", "dikey", gorselYonu({ width: 3648, height: 5472 }), "dikey", "3648x5472");
ok("b", "kare", gorselYonu({ width: 500, height: 500 }), "kare", "500x500");
// 696x675 canli olcumden: oran 1.03 — "yatay" demek kullaniciyi yanıltırdı
ok("b", "neredeyse kare -> kare", gorselYonu({ width: 696, height: 675 }), "kare", "696x675");
ok("b", "olcu metni", olcuMetni({ width: 3648, height: 5472 }), "3648×5472 piksel (dikey)", "3648x5472");
okTrue("b", "olcu metninde carpi isareti (x degil)", olcuMetni({ width: 10, height: 20 }).includes("×"), "10x20");

// ===========================================================================
header("(c) degerlendir — canli olculen gercek degerlerle");
// ===========================================================================
const VAKALAR = [
  // [genislik, yukseklik, beklenen seviye, ust/alt kirpma?, yan kirpma?, kucuk?, not]
  [1200, 630, "ok", false, false, false, "onerilen olcu"],
  [1200, 675, "ok", false, false, false, "canli: tek dogru olculu kapak (1.78)"],
  [1096, 591, "ok", false, false, false, "canli: 1.85"],
  [3648, 5472, "uyari", true, false, false, "canli: en kotu dikey (0.67)"],
  [2813, 3679, "uyari", true, false, false, "canli: 0.76"],
  [311, 675, "uyari", true, false, true, "🔴 canli: bizim boru hattimizin urettigi"],
  [485, 135, "uyari", false, true, true, "🔴 canli: serit + esik alti"],
  [696, 675, "uyari", true, false, false, "canli: 1.03 neredeyse kare"],
  [600, 840, "uyari", true, false, false, "🔴 canli: DEFAULT KURUMUN LOGOSU"],
  [900, 600, "ok", false, false, false, "canli: manset 1.50"],
  [1400, 600, "ok", false, false, false, "manset onerilen olcu (2.33)"],
  [5712, 4284, "uyari", true, false, false, "canli: 1.33 (4:3) — YATAY ama dar, %30 kayip"],
  [1200, 1800, "uyari", true, false, false, "ADIM 0 sonrasi dikey kapak: kirpilir ama BUYUK"],
];

for (const [w, h, seviye, ustAlt, yan, kucuk, not] of VAKALAR) {
  const r = degerlendir({ width: w, height: h });
  const girdi = `${w}x${h} — ${not}`;
  ok("c", `${w}x${h} seviye`, r.seviye, seviye, girdi);
  ok(
    "c",
    `${w}x${h} ust/alt kirpma uyarisi`,
    r.uyarilar.some((u) => u.includes("üstü ve altı kesilir")),
    ustAlt,
    girdi
  );
  ok(
    "c",
    `${w}x${h} yan kirpma uyarisi`,
    r.uyarilar.some((u) => u.includes("yanları kesilir")),
    yan,
    girdi
  );
  ok(
    "c",
    `${w}x${h} kucukluk uyarisi`,
    r.uyarilar.some((u) => u.includes("küçük görünür")),
    kucuk,
    girdi
  );
}

// Uyarilar BIRIKIR: 311x675 iki ayri sorunu var, ikisi de soylenmeli
ok("c", "311x675 iki uyari birden", degerlendir({ width: 311, height: 675 }).uyarilar.length, 2, "311x675");
// Ust/alt kirpma ile yan kirpma AYNI ANDA olamaz (biri dar, oteki genis)
okTrue(
  "c",
  "ust/alt ve yan kirpma uyarisi birlikte cikmaz",
  VAKALAR.every(([w, h]) => {
    const u = degerlendir({ width: w, height: h }).uyarilar;
    return !(
      u.some((x) => x.includes("üstü ve altı kesilir")) && u.some((x) => x.includes("yanları kesilir"))
    );
  }),
  "tum vakalar"
);

// 🔴 Uyari metni gorselin GERCEK seklini soylemeli: 5712x4284 YATAY bir
// fotograf, ona "dikey" demek kullaniciya gozuyle gordugunun tersini
// soylemek olurdu (ilk turda bu hata vardi, mutasyon degil ölçüm yakaladi).
okTrue(
  "c",
  "🔴 yatay ama dar gorsele 'dikey' DENMEZ",
  !degerlendir({ width: 5712, height: 4284 }).uyarilar.some((u) => u.includes("dikey")),
  "5712x4284"
);
okTrue(
  "c",
  "yatay ama dar gorsele 'çerçeveye göre dar' denir",
  degerlendir({ width: 5712, height: 4284 }).uyarilar.some((u) =>
    u.includes("paylaşım çerçevesine göre dar")
  ),
  "5712x4284"
);
okTrue(
  "c",
  "gercekten dikey gorsele 'dikey' denir",
  degerlendir({ width: 3648, height: 5472 }).uyarilar.some((u) => u.includes("Bu görsel dikey")),
  "3648x5472"
);
okTrue(
  "c",
  "neredeyse kare gorsele 'kare' denir",
  degerlendir({ width: 696, height: 675 }).uyarilar.some((u) => u.includes("Bu görsel kare")),
  "696x675"
);

// Esik kenarlari — tam sinirda uyari YOK (kapsayici)
ok("c", "oran tam 1.4 -> uyari yok", degerlendir({ width: 1400, height: 1000 }).seviye, "ok", "1400x1000 = 1.40");
ok("c", "oran 1.39 -> dikey uyarisi", degerlendir({ width: 1390, height: 1000 }).seviye, "uyari", "1390x1000");
ok("c", "oran tam 2.5 -> uyari yok", degerlendir({ width: 2500, height: 1000 }).seviye, "ok", "2500x1000 = 2.50");
ok("c", "oran 2.51 -> genislik uyarisi", degerlendir({ width: 2510, height: 1000 }).seviye, "uyari", "2510x1000");
ok("c", "genislik tam 600 -> kucukluk uyarisi yok", degerlendir({ width: 600, height: 340 }).seviye, "ok", "600x340");
ok(
  "c",
  "genislik 599 -> kucukluk uyarisi",
  degerlendir({ width: 599, height: 340 }).uyarilar.some((u) => u.includes("küçük görünür")),
  true,
  "599x340"
);
ok(
  "c",
  "yukseklik 314 -> kucukluk uyarisi",
  degerlendir({ width: 1200, height: 314 }).uyarilar.some((u) => u.includes("küçük görünür")),
  true,
  "1200x314"
);

// 🔴 Gecersiz olcu "ok" DONMEZ — olcemedigimizi saglam saymak sessiz basarisizlik
for (const [w, h] of [[0, 100], [100, 0], [-5, 100], [NaN, 100], [Infinity, 100]]) {
  ok("c", `gecersiz olcu ${w}x${h} -> uyari`, degerlendir({ width: w, height: h }).seviye, "uyari", `${w}x${h}`);
}
ok("c", "gecersiz olcu metni", degerlendir({ width: 0, height: 0 }).olcuMetni, "ölçü okunamadı", "0x0");

// ===========================================================================
header("(d) 🔴 ADIM 0 — kapakta yukseklik siniri KALKTI");
// ===========================================================================
const media = read(MEDIA);
const mediaKod = stripComments(media);
const mediaUploader = tag(mediaKod, "ImageUploader");

okTrue("d", "MediaSection ImageUploader'i var", mediaUploader.length > 0, MEDIA);
okTrue("d", "kapakta maxWidth VAR", /maxWidth=\{coverMaxWidth\}/.test(mediaUploader), mediaUploader);
okTrue("d", "🔴 kapakta maxHeight YOK", !/maxHeight/.test(mediaUploader), mediaUploader);
okTrue("d", "coverMaxHeight prop'u tamamen kaldirildi", !/coverMaxHeight/.test(mediaKod), MEDIA);
okTrue("d", "coverMaxWidth varsayilani 1200", /coverMaxWidth = 1200/.test(mediaKod), MEDIA);
// Galeri coklu yukleyicisi ayri bir is — ADIM 0 onu KAPSAMIYOR, dokunulmadigi muhurlu
okTrue(
  "d",
  "galeri coklu yukleme sinirlari degismedi (1600x1600)",
  /maxWidth:\s*1600,\s*\n?\s*maxHeight:\s*1600/.test(mediaKod.replace(/\s+/g, " ").replace(/ /g, " ")) ||
    /maxWidth: 1600/.test(mediaKod),
  MEDIA
);
// RichTextEditor ayni deseni zaten kullaniyordu — emsal mührü
okTrue(
  "d",
  "RichTextEditor emsali duruyor (genislik cap'i, yukseklik serbest)",
  /compressImage\(file,\s*\{\s*maxWidth:\s*1280/.test(stripComments(read("src/components/admin/RichTextEditor.tsx"))),
  "RichTextEditor"
);

// ---------------------------------------------------------------------------
// 🔴 ADIM 0, kalan iki kutu (21 Eylul 2026 ikinci tur)
//
// Manset ve galeri albumu kapagi da og:image zincirini besliyor ve ayni
// "kutuya sigdir" kusurunu tasiyordu. GERCEK dosyalarla olculdu:
//
//   MANSET (eski 1400x600 kutu)          YENI (genislik 1400, yukseklik serbest)
//     3648x5472 -> 400x600  🔴 esik alti   -> 1400x2100  GECER
//     2813x3679 -> 459x600  🔴 esik alti   -> 1400x1831  GECER
//   ALBUM (eski 1200x675 kutu)
//     3648x5472 -> 450x675  🔴 esik alti   -> 1200x1800  GECER
//     2813x3679 -> 516x675  🔴 esik alti   -> 1200x1569  GECER
//
// Sinir geri eklenirse bu muhurler KIRILIR.
// ---------------------------------------------------------------------------
const mansetUploader = tag(stripComments(read(MANSET)), "ImageUploader");
okTrue("d", "manset ImageUploader'i bulundu", mansetUploader.length > 0, MANSET);
okTrue("d", "manset maxWidth 1400 DURUYOR", /maxWidth=\{1400\}/.test(mansetUploader), mansetUploader);
okTrue("d", "🔴 manset maxHeight YOK", !/maxHeight/.test(mansetUploader), mansetUploader);

for (const [dosya, ad] of [[GALERI, "galeri (liste)"], [GALERI_ID, "galeri (detay)"]]) {
  const t = tag(stripComments(read(dosya)), "ImageUploader");
  okTrue("d", `${ad}: ImageUploader bulundu`, t.length > 0, dosya);
  okTrue("d", `${ad}: maxWidth 1200 DURUYOR`, /maxWidth=\{1200\}/.test(t), t);
  okTrue("d", `🔴 ${ad}: maxHeight YOK`, !/maxHeight/.test(t), t);
}

// 🔴 Paylasimi besleyen DORT kutunun HICBIRINDE yukseklik siniri kalmadi —
// tek tek degil, kume olarak muhurlu ki yarin yeni bir kutu eklenirse de
// ayni kural aransin.
const PAYLASIM_KUTULARI = [
  [MEDIA, "haber/duyuru/sayfa kapagi"],
  [MANSET, "manset"],
  [GALERI, "galeri albumu (liste)"],
  [GALERI_ID, "galeri albumu (detay)"],
];
for (const [dosya, ad] of PAYLASIM_KUTULARI) {
  const t = tag(stripComments(read(dosya)), "ImageUploader");
  okTrue("d", `🔴 ${ad}: paylasim kutusunda yukseklik siniri YOK`, !/maxHeight/.test(t), dosya);
  okTrue("d", `${ad}: genislik siniri VAR`, /maxWidth=/.test(t), dosya);
}

// DOKUNULMAYANLAR — bunlar paylasimda kullanilmiyor, sinirlari DURMALI.
// (Kaldirilirlarsa bu tur kapsami disina tasilmis demektir.)
const DOKUNULMAYANLAR = [
  [SLIDER, "slider", /maxWidth=\{1200\}/, /maxHeight=\{600\}/],
  [BOLUM, "anasayfa bolum ogesi", /maxWidth=\{1200\}/, /maxHeight=\{800\}/],
  [YONETIM, "yonetim kurulu", /maxWidth=\{600\}/, /maxHeight=\{750\}/],
];
for (const [dosya, ad, gen, yuk] of DOKUNULMAYANLAR) {
  const t = tag(stripComments(read(dosya)), "ImageUploader");
  okTrue("d", `${ad}: genislik siniri korundu`, gen.test(t), dosya);
  okTrue("d", `${ad}: yukseklik siniri KORUNDU (dokunulmadi)`, yuk.test(t), dosya);
}
// Sube yoneticisi ve favicon ayni dosyalarda ikinci/ucuncu yukleyici — ayrica bakilir
okTrue(
  "d",
  "sube yoneticisi 400x500 korundu",
  /maxWidth=\{400\}/.test(stripComments(read(SUBELER))) && /maxHeight=\{500\}/.test(stripComments(read(SUBELER))),
  SUBELER
);
okTrue(
  "d",
  "favicon 256x256 korundu",
  /maxWidth=\{256\}/.test(read(AYARLAR)) && /maxHeight=\{256\}/.test(read(AYARLAR)),
  AYARLAR
);

// ===========================================================================
header("(e) 🔴 ImageUploader onizlemesi artik yalan soylemiyor");
// ===========================================================================
const uploader = read(UPLOADER);
const uploaderKod = stripComments(uploader);
const uploaderPreview = uploaderKod.slice(uploaderKod.indexOf("if (value)"));

okTrue("e", "onizleme object-contain", /className="object-contain"/.test(uploaderPreview), UPLOADER);
okTrue("e", "🔴 onizlemede object-cover YOK", !/className="object-cover"/.test(uploaderPreview), UPLOADER);
okTrue("e", "SharePreview import edildi", /import SharePreview from "@\/components\/admin\/SharePreview"/.test(uploaderKod), UPLOADER);
okTrue("e", "SharePreview yalniz sharePreview=true iken cizilir", /\{sharePreview && <SharePreview/.test(uploaderKod), UPLOADER);
okTrue("e", "SharePreview'a value gecirilir", /<SharePreview src=\{value\}/.test(uploaderKod), UPLOADER);
okTrue("e", "sharePreview varsayilani false", /sharePreview = false/.test(uploaderKod), UPLOADER);
okTrue("e", "sharePreviewNote prop'u var", /sharePreviewNote\?: string/.test(uploader), UPLOADER);
// Yukleme sinirlari degismedi (regresyon)
okTrue("e", "sikistirma hala maxWidth/maxHeight'a bagli", /if \(maxWidth \|\| maxHeight\)/.test(uploaderKod), UPLOADER);

// ===========================================================================
header("(f) SharePreview — 1,91:1 cerceve");
// ===========================================================================
const preview = read(PREVIEW);
const previewKod = stripComments(preview);

okTrue("f", "1,91:1 cerceve kullaniliyor", /aspect-\[1\.91\/1\]/.test(previewKod), PREVIEW);
okTrue("f", "cercevede object-cover (paylasim gibi kirpar)", /className="object-cover"/.test(previewKod), PREVIEW);
okTrue("f", "etiket: 'Paylaşıldığında böyle görünecek'", previewKod.includes("Paylaşıldığında böyle görünecek"), PREVIEW);
okTrue("f", "olcu satiri: 'Yüklenen görsel:'", previewKod.includes("Yüklenen görsel:"), PREVIEW);
okTrue("f", "onerilen olcu sabitlerden uretiliyor", /\{ONERILEN_GENISLIK\}×\{ONERILEN_YUKSEKLIK\}/.test(previewKod), PREVIEW);
okTrue("f", "olculemedi durumu GOSTERILIYOR", previewKod.includes("ölçüsü okunamadı"), PREVIEW);
okTrue("f", "olcu URL'den okunuyor (kayitli gorseller de)", /gorselOlcusunuOku\(src\)/.test(previewKod), PREVIEW);
okTrue("f", "src bossa hicbir sey cizilmez", /if \(!src\) return null/.test(previewKod), PREVIEW);
okTrue("f", "yaris kosulu korumasi (iptal bayragi)", /iptal = true/.test(previewKod), PREVIEW);
okTrue("f", "src degisince yeniden olculur", /\}, \[src\]\)/.test(previewKod), PREVIEW);
okTrue("f", "uyarilar degerlendir()'den geliyor", /degerlendir\(olcu\)/.test(previewKod), PREVIEW);
okTrue("f", "bozuk src'de SafeImage fallback'i var", /fallback=\{/.test(previewKod), PREVIEW);

// ===========================================================================
header("(g) Cagri noktalari — paylasimi besleyenlerde ACIK, digerlerinde KAPALI");
// ===========================================================================
// og:image zinciri (lib/seo.ts -> pickOgImage): icerigin kapagi -> kurumun logosu
const ACIK = [
  [MEDIA, "haber/duyuru/sayfa kapagi"],
  [MANSET, "manset gorseli"],
  [GALERI, "galeri albumu kapagi (liste)"],
  [GALERI_ID, "galeri albumu kapagi (detay)"],
  [AYARLAR, "kurum logosu"],
];
// 🔴 `sharePreviewNote` prop'u "sharePreview" dizesini ICERIYOR. Naif bir
// arama, prop tamamen kaldirilsa bile PASS verirdi — ilk mutasyon turunda
// M10 tam olarak bunu gosterdi (159/0, yani test sahte guven veriyordu).
// Bu yuzden desen "Note ile devam ETMEYEN sharePreview".
const SHARE_PROP = /sharePreview(?!Note)/;

for (const [dosya, ad] of ACIK) {
  const src = stripComments(read(dosya));
  okTrue("g", `${ad}: sharePreview ACIK`, SHARE_PROP.test(src), dosya);
}

// Paylasimda KULLANILMAYAN kutular — uyari korlugu uretmesin
const KAPALI = [
  [SLIDER, "slider"],
  [BOLUM, "anasayfa bolum ogesi"],
  [SUBELER, "sube yoneticisi fotografi"],
  [YONETIM, "yonetim kurulu fotografi (dikeylik kabul edilmis karar)"],
];
for (const [dosya, ad] of KAPALI) {
  const src = stripComments(read(dosya));
  okTrue("g", `${ad}: sharePreview KAPALI`, !SHARE_PROP.test(src), dosya);
}

// Favicon ayni dosyada (ayarlar) — logo acik, favicon kapali olmali
const ayarlarKod = stripComments(read(AYARLAR));
const ayarlarUploaders = tags(ayarlarKod, "ImageUploader");
ok("g", "ayarlar'da iki yukleyici var (logo + favicon)", ayarlarUploaders.length, 2, AYARLAR);
okTrue("g", "logo yukleyicisinde sharePreview ACIK", SHARE_PROP.test(ayarlarUploaders[0]), AYARLAR);
// Bare prop ("sharePreview" + bosluk) aranir; "sharePreviewNote=" eslesmez.
okTrue(
  "g",
  "🔴 logo: not prop'u TEK BASINA yetmez, sharePreview de olmali",
  /sharePreview\s/.test(ayarlarUploaders[0]),
  AYARLAR
);
okTrue("g", "favicon yukleyicisinde sharePreview KAPALI", !SHARE_PROP.test(ayarlarUploaders[1]), AYARLAR);
okTrue("g", "favicon hala toWebp={false}", /toWebp=\{false\}/.test(ayarlarUploaders[1]), AYARLAR);

// ===========================================================================
header("(h) Yonlendirme metinleri + logo notu");
// ===========================================================================
okTrue("h", "kapak kutusunda 1200×630 onerisi", read(MEDIA).includes("1200×630 piksel (yatay)"), MEDIA);
okTrue("h", "galeri (liste) kutusunda 1200×630 onerisi", read(GALERI).includes("1200×630 piksel (yatay)"), GALERI);
okTrue("h", "galeri (detay) kutusunda 1200×630 onerisi", read(GALERI_ID).includes("1200×630 piksel (yatay)"), GALERI_ID);
okTrue("h", "SharePreview'da onerilen olcu satiri", previewKod.includes("Önerilen:"), PREVIEW);
// 🔴 Ayni sayiyi iki kez soylememek: her kutunun yaninda zaten bir
// "Önerilen: 1200×630" satiri var. SharePreview'daki ikizi YALNIZ uyari
// varken ya da olcu okunamamisken cikar.
okTrue(
  "h",
  "🔴 SharePreview onerisi KOSULLU (uyari ya da olculemedi)",
  /durum\.tip === "hata" \|\| \(durum\.tip === "hazir" && durum\.sonuc\.seviye === "uyari"\)/.test(previewKod),
  PREVIEW
);
// 🔴 Logo: panelde bugune kadar HIC soylenmiyordu
okTrue(
  "h",
  "🔴 logo notu: 'kapağı olmayan sayfaların paylaşım görseli'",
  /sharePreviewNote="Logonuz, kapağı olmayan sayfaların \(anasayfa dahil\) paylaşım görseli olarak da kullanılır\."/.test(
    read(AYARLAR)
  ),
  AYARLAR
);
okTrue("h", "logo kutusunda yatay onerisi", read(AYARLAR).includes("Yatay bir logo paylaşımlarda daha iyi görünür"), AYARLAR);
// 🔴 Manset onerisi 1400x600'den 1200x630'a cekildi (21 Eylul 2026).
// Gerekce OLCULDU (Playwright, canli dev sunucu): manset seridinin sitedeki
// cercevesi TEK BIR ORAN DEGIL —
//     390px  -> 350x350  (1.00)
//     1249px -> 645x450  (1.43)
//     1440px -> 816x450  (1.81)
//     1920px -> 987x450  (2.19)
// 1400x600'un (2.33) karsilik geldigi bir cerceve YOK, olculen bandin da
// disinda. Paylasim cercevesi ise SABIT (1.91:1) ve 1200x630 hem orada tam
// oturuyor hem de site bandinin (1.00-2.19) ortasina dusuyor.
okTrue("h", "manset onerisi 1200×630", read(MANSET).includes("Önerilen: 1200×630 piksel (yatay)"), MANSET);
okTrue("h", "eski 1400 × 600 onerisi kalmadi", !read(MANSET).includes("Önerilen boyut: 1400 × 600 piksel"), MANSET);
okTrue(
  "h",
  "manset metninde genislik cap'i aciklanmis",
  read(MANSET).includes("en fazla 1400 piksel genişliğe küçültülür"),
  MANSET
);
// Dort paylasim kutusu da AYNI sayiyi soylemeli — celisen oneri olmasin
for (const [dosya, ad] of [[MEDIA, "kapak"], [MANSET, "manset"], [GALERI, "galeri liste"], [GALERI_ID, "galeri detay"]]) {
  okTrue("h", `${ad}: oneri 1200×630 (tek sayi)`, read(dosya).includes("1200×630 piksel (yatay)"), dosya);
  okTrue("h", `${ad}: rakip bir oneri yok`, !/Önerilen boyut: 1[34]00/.test(read(dosya)), dosya);
}
ok("h", "onerilen olcu uyari almiyor", degerlendir({ width: 1200, height: 630 }).seviye, "ok", "1200x630 = 1.90");
// Olculen site cerceveleri: onerilen oran bandin ICINDE mi
ok("h", "1.91 site bandinin (1.00-2.19) icinde", 1.91 > 1.0 && 1.91 < 2.19, true, "olculen cerceveler");
ok("h", "eski 2.33 onerisi bandin DISINDAYDI", 1400 / 600 > 2.19, true, "1400x600 = 2.33 > 2.19");

// ===========================================================================
header("(i) Yonetim kurulu — ayni oran, esigi geciyor");
// ===========================================================================
const yonetim = read(YONETIM);
const yonetimUploader = tag(stripComments(yonetim), "ImageUploader");
okTrue("i", "maxWidth 600", /maxWidth=\{600\}/.test(yonetimUploader), YONETIM);
okTrue("i", "maxHeight 750", /maxHeight=\{750\}/.test(yonetimUploader), YONETIM);
okTrue("i", "eski 400x500 kalmadi", !/maxWidth=\{400\}/.test(yonetimUploader), YONETIM);
okTrue("i", "metin 600 × 750'ye guncellendi", yonetim.includes("portre (dikey) oran, 600 × 750 piksel"), YONETIM);
okTrue("i", "metinde eski 400 × 500 kalmadi", !yonetim.includes("400 × 500"), YONETIM);
// Oran korundu (portre) ve yeni olcu esigi geciyor
ok("i", "oran degismedi (400/500 = 600/750)", 600 / 750, 400 / 500, "oran");
okTrue(
  "i",
  "🔴 600x750 artik 600x315 esigini geciyor",
  !degerlendir({ width: 600, height: 750 }).uyarilar.some((u) => u.includes("küçük görünür")),
  "600x750"
);
okTrue(
  "i",
  "eski 400x500 esigin ALTINDAYDI",
  degerlendir({ width: 400, height: 500 }).uyarilar.some((u) => u.includes("küçük görünür")),
  "400x500"
);
okTrue("i", "portre kaldi (dikey)", gorselYonu({ width: 600, height: 750 }) === "dikey", "600x750");

// ===========================================================================
header("(j) sayfa/[slug] kendi kapagini GECIRIYOR (madde 9/1)");
// ===========================================================================
const sayfa = stripComments(read(SAYFA));
okTrue("j", "🔴 sayfa/[slug] image: data.cover_image geciriyor", /image:\s*data\.cover_image/.test(sayfa), SAYFA);
// Regresyon: digerleri gecirmeye devam ediyor
const GECIRENLER = [
  [HABER, "data.cover_image", "haber detayi"],
  [DUYURU, "data.cover_image", "duyuru detayi"],
  [ALBUM, "data.cover_image", "album detayi"],
  [MANSET_PUBLIC, "data.image_url", "manset detayi"],
];
for (const [dosya, alan, ad] of GECIRENLER) {
  const src = stripComments(read(dosya));
  okTrue("j", `${ad} hala kendi kapagini geciriyor`, src.includes(`image: ${alan}`), dosya);
}
okTrue(
  "j",
  "pages sorgusu kapagi getiriyor (select *)",
  /from\("pages"\)[\s\S]{0,80}\.select\("\*"\)/.test(stripComments(read("src/lib/public-queries.ts"))),
  "public-queries.ts"
);

// ===========================================================================
header("(k) 🔴 Cok kiracili — paylasim onizlemesi kurum verisine BAKMAZ");
// ===========================================================================
// Onizleme yalniz kendisine verilen `src`'yi olcer. Kurum cozumlemesi,
// site_settings okumasi, Supabase cagrisi YOK — yani bir kurumun onizlemesi
// baska bir kurumun ayarindan beslenemez.
for (const [dosya, ad] of [[SHARE_LIB, "share-image.ts"], [PREVIEW, "SharePreview.tsx"]]) {
  const src = stripComments(read(dosya));
  okTrue("k", `${ad}: tenant okumasi yok`, !/useTenant|getCurrentTenant|tenant_id/.test(src), dosya);
  okTrue("k", `${ad}: site_settings okumasi yok`, !/site_settings|getSiteSettings/.test(src), dosya);
  okTrue("k", `${ad}: supabase cagrisi yok`, !/supabase|createClient/i.test(src), dosya);
}
okTrue("k", "SharePreview yalniz src prop'undan besleniyor", /gorselOlcusunuOku\(src\)/.test(previewKod), PREVIEW);
// Yukleme yolu tenant prefix'ini korumaya devam ediyor (regresyon)
okTrue(
  "k",
  "ImageUploader hala tenant klasorune yukluyor",
  /buildStoragePath\(tenant\.id, folder, fileName\)/.test(uploaderKod),
  UPLOADER
);
okTrue("k", "tenant yoksa yukleme yapilmiyor", /if \(!tenant\)/.test(uploaderKod), UPLOADER);
// og:image zinciri degismedi — kurumun kendi logosuna duser, platform sabiti YOK
okTrue(
  "k",
  "seo.ts zinciri hala icerigin kapagi -> KURUMUN logosu",
  /pickOgImage\(input\.image, map\.logo_url\)/.test(stripComments(read("src/lib/seo.ts"))),
  "seo.ts"
);

// ===========================================================================
console.log("");
if (failures.length === 0) {
  console.log(`SONUC: ${passed} gecti, 0 kaldi`);
} else {
  console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
  for (const f of failures) console.log(`  - [${f.group}] ${f.name}`);
  process.exit(1);
}
