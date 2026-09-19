/**
 * "Baslangic Adimlari" (kurum admini kurulum rehberi) testi — 19 Eylul 2026.
 *
 * CALISTIRMA:
 *   npm run test:setup-guide
 *   (= node scripts/test-setup-guide.mjs)
 *
 * BAGLAM:
 *   Panele ilk giren kurum admini 13 ekran goruyor ve nereden baslayacagini
 *   bilmiyordu. Super admin tarafinda canli olculen "Kurulum Durumu" vardi,
 *   kurum admini tarafinda karsiligi yoktu. Ozet ekranina, sitenin
 *   ziyaretciye eksik gorunen yanlarini gosteren ve dogrudan ilgili ekrana
 *   goturen bir bolum eklendi.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) esikler — logo sentinel'i, iletisim, sayim tabanli adimlar
 *   (b) SIFIR ile OKUNAMADI ayrimi — tek null okuma tum listeyi susturur
 *       (sahte "adim acik" uretmemek icin; super admindeki "asla sahte
 *       Tamam" ilkesinin karsiligi)
 *   (c) menu adimi YALNIZ 0 ogede listeye girer
 *   (d) sira ve bagimlilik (once kategori, sonra haber)
 *   (e) ilerleme ozeti — Turkce iyelik eki tuzagi ("3'u" degil "3 tanesi")
 *   (f) kapatma bayragi — site_settings anahtari, localStorage DEGIL
 *   (g) kardes liste tutarliligi — PLACEHOLDER_LOGO_URL iki tarafta AYNI
 *   (h) kod tutarliligi — dashboard tek dalgada okuyor, ayarlar capalari var
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir (type
 * stripping); goreli yollar bu yuzden ".ts" uzantili.
 */

import { readFileSync } from "node:fs";
import {
  SETUP_GUIDE_DISMISSED_KEY,
  SETUP_GUIDE_SETTING_KEYS,
  evaluateSetupGuide,
  hasRealLogo,
  summarizeSetupGuide,
} from "../src/lib/setup-guide.ts";
import { PLACEHOLDER_LOGO_URL } from "../src/lib/constants.ts";
import { PLACEHOLDER_LOGO_URL as CHECKLIST_PLACEHOLDER } from "../src/lib/super-admin/setup-checklist.ts";

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
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}

function header(title) {
  console.log("");
  console.log(title);
  console.log("");
}

/**
 * "Bu dosyada su gecmesin" kontrolleri icin: YORUMLARI atar.
 *
 * Gerekce: bu turun dosyalari kararlarini yorumda GEREKCELENDIRIYOR —
 * "localStorage kullanilmiyor cunku…", "kirmizi (text-error) yok",
 * "eskiden count || 0 yaziliyordu". Ham metinde arayinca bu aciklamalar
 * kendi kurallarini ihlal etmis gibi gorunuyordu (ilk kosuda 3 sahte FAIL).
 *
 * Yalniz blok yorumlar ve TAM SATIR // yorumlari atilir; satir sonundaki
 * // parcalari ELLENMEZ — koddaki "https://" gibi diziler kirpilirsa
 * negatif kontrol sahte PASS verebilirdi.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Fiksturler
// ---------------------------------------------------------------------------

/** create-tenant'in yeni kurumda biraktigi hal (olculdu, route 6. adim). */
const SEED_SETTINGS = {
  logo_url: PLACEHOLDER_LOGO_URL,
  contact_phone: "",
  contact_address: "",
};

/** Yeni kurum: menu tohumlanmis (5 oge), geri kalan bos. */
const SEED_COUNTS = {
  menuItems: 5,
  categories: 0,
  news: 0,
  announcements: 0,
  headlines: 0,
  sliders: 0,
  homepageSections: 0,
  galleryAlbums: 0,
};

const DONE_SETTINGS = {
  logo_url: "https://x.supabase.co/storage/v1/object/public/images/branding/logo.webp",
  contact_phone: "+90 312 000 00 00",
  contact_address: "Kizilay, Ankara",
};

const DONE_COUNTS = {
  menuItems: 5,
  categories: 2,
  news: 3,
  announcements: 1,
  headlines: 1,
  sliders: 0,
  homepageSections: 2,
  galleryAlbums: 1,
};

const snap = (settings, counts, tenantLogoUrl = null) => ({
  settings,
  tenantLogoUrl,
  counts: { ...SEED_COUNTS, ...counts },
});

/** Degerlendir ve okunabilir sonucu dondur (okunamazsa testi patlatir). */
function evalOk(input) {
  const r = evaluateSetupGuide(input);
  if (!r.readable) throw new Error("okunabilir sonuc bekleniyordu");
  return r;
}

const idsOf = (r) => r.steps.map((s) => s.id);
const openIds = (r) => r.steps.filter((s) => !s.done).map((s) => s.id);
const stepById = (r, id) => r.steps.find((s) => s.id === id);

// ---------------------------------------------------------------------------
header("(a) Esikler");
// ---------------------------------------------------------------------------
{
  ok("logo", "tohum degeri logo SAYILMAZ", hasRealLogo(null, PLACEHOLDER_LOGO_URL), false, PLACEHOLDER_LOGO_URL);
  ok("logo", "bos deger logo sayilmaz", hasRealLogo(null, ""), false, '""');
  ok("logo", "null deger logo sayilmaz", hasRealLogo(null, null), false, "null");
  ok("logo", "yalnizca bosluk logo sayilmaz", hasRealLogo(null, "   "), false, '"   "');
  ok("logo", "gercek URL logo sayilir", hasRealLogo(null, DONE_SETTINGS.logo_url), true, "storage url");
  // public layout tenants.logo_url'i site_settings'ten ONCE okuyor
  ok("logo", "tenants.logo_url doluysa yeter", hasRealLogo("https://x/logo.png", PLACEHOLDER_LOGO_URL), true, "tenant logo");
  // BOS OLMAYAN ILK deger kazanir (public layout ile birebir): tenant
  // kolonu tohum sentinel'iyken ziyaretci harf avatari goruyor, arkadaki
  // site_settings logosu EKRANA GELMIYOR → adim acik kalmali.
  ok("logo", "tenants.logo_url tohumsa ziyaretci logoyu gormez", hasRealLogo(PLACEHOLDER_LOGO_URL, DONE_SETTINGS.logo_url), false, "tenant=tohum, settings=gercek");
  ok("logo", "tenants.logo_url bossa site_settings'e bakilir", hasRealLogo("", DONE_SETTINGS.logo_url), true, "tenant='', settings=gercek");
  ok("logo", "tenants.logo_url null ise site_settings'e bakilir", hasRealLogo(null, DONE_SETTINGS.logo_url), true, "tenant=null, settings=gercek");

  const seed = evalOk(snap(SEED_SETTINGS, {}));
  ok("tohum", "yeni kurumda 8 adim (menu tohumlu)", seed.total, 8, "SEED");
  ok("tohum", "yeni kurumda hicbiri tamam degil", seed.doneCount, 0, "SEED");
  ok("tohum", "adim sirasi", idsOf(seed), ["logo", "iletisim", "kategori", "haber", "duyuru", "manset", "bolumler", "galeri"], "SEED");

  const done = evalOk(snap(DONE_SETTINGS, DONE_COUNTS));
  ok("dolu", "hepsi tamam", done.allDone, true, "DONE");
  ok("dolu", "acik adim yok", openIds(done), [], "DONE");

  // Manset: headlines VEYA sliders — public tarafta kapak gorselleri
  // yalniz manset yokken gosteriliyor, ikisi de bossa "Manset Eklenmemis"
  const onlySlider = evalOk(snap(SEED_SETTINGS, { headlines: 0, sliders: 2 }));
  ok("manset", "yalniz kapak gorseli varsa adim kapanir", stepById(onlySlider, "manset").done, true, "sliders=2");
  const onlyHeadline = evalOk(snap(SEED_SETTINGS, { headlines: 1, sliders: 0 }));
  ok("manset", "yalniz manset varsa adim kapanir", stepById(onlyHeadline, "manset").done, true, "headlines=1");
  const neither = evalOk(snap(SEED_SETTINGS, { headlines: 0, sliders: 0 }));
  ok("manset", "ikisi de yoksa adim acik", stepById(neither, "manset").done, false, "ikisi de 0");

  // Iletisim metni eksige gore degisir — "telefon ve adres yok" demek,
  // yalniz telefonu bos olana YANLIS bilgi verir.
  const noPhone = evalOk(snap({ ...DONE_SETTINGS, contact_phone: "" }, DONE_COUNTS));
  ok("iletisim", "yalniz telefon eksik → telefon metni", stepById(noPhone, "iletisim").detail, "İletişim sayfasında telefon numarası görünmüyor.", "phone=''");
  const noAddress = evalOk(snap({ ...DONE_SETTINGS, contact_address: "  " }, DONE_COUNTS));
  ok("iletisim", "yalniz adres eksik → adres + harita metni", stepById(noAddress, "iletisim").detail, "İletişim sayfasında adres ve harita görünmüyor.", "address='  '");
  const neitherContact = evalOk(snap(SEED_SETTINGS, {}));
  ok("iletisim", "ikisi de eksik → birlesik metin", stepById(neitherContact, "iletisim").detail, "İletişim sayfasında telefon ve adres görünmüyor, harita da çıkmıyor.", "SEED");
  ok("iletisim", "ikisi de doluysa adim kapanir", stepById(evalOk(snap(DONE_SETTINGS, DONE_COUNTS)), "iletisim").done, true, "DONE");

  // Eksik anahtar (DB'de satir hic yoksa) bos sayilir, patlamaz
  const missingKeys = evalOk(snap({}, {}));
  ok("iletisim", "site_settings satiri hic yoksa adim acik", stepById(missingKeys, "iletisim").done, false, "{}");
  ok("logo", "site_settings satiri hic yoksa logo adimi acik", stepById(missingKeys, "logo").done, false, "{}");
}

// ---------------------------------------------------------------------------
header("(b) SIFIR ile OKUNAMADI ayrimi");
// ---------------------------------------------------------------------------
{
  // Bu ayrim rehberin can damari: 0 "adim acik", null "bilmiyorum".
  // Eskiden dashboard `count || 0` yaziyordu — patlayan sorgu ekranda 0
  // gorunuyordu; rehber o sayaclardan beslendigi icin sahte "adim acik"
  // uretirdi ("haberiniz yok" derken aslinda sorgu patlamis olurdu).
  ok("okunamadi", "site_settings null → susar", evaluateSetupGuide(snap(null, {})).readable, false, "settings=null");

  for (const key of Object.keys(SEED_COUNTS)) {
    const r = evaluateSetupGuide(snap(SEED_SETTINGS, { [key]: null }));
    ok("okunamadi", `${key} null → susar`, r.readable, false, `${key}=null`);
  }

  // Okunamayan hal de KAPATMA TERCIHINI tasir: rehberi gizlemis birine,
  // gecici bir sayim hatasi yuzunden "Kurulum durumu okunamadi" satiri
  // gostermek kapatma vaadini bozardi. Bayrak site_settings'ten geliyor —
  // o okuma basariliyken tercih BILINIYOR demektir.
  const hiddenBroken = evaluateSetupGuide(
    snap({ ...SEED_SETTINGS, setup_guide_dismissed: "true" }, { news: null })
  );
  ok("okunamadi", "gizliyken sayim patlarsa readable false", hiddenBroken.readable, false, "gizli + news=null");
  ok("okunamadi", "gizliyken sayim patlasa da tercih tasinir", hiddenBroken.dismissed, true, "gizli + news=null");
  const shownBroken = evaluateSetupGuide(snap(SEED_SETTINGS, { news: null }));
  ok("okunamadi", "gizli degilken tercih false kalir", shownBroken.dismissed, false, "acik + news=null");
  // site_settings'in KENDISI okunamadiysa tercih BILINMIYOR → false
  ok("okunamadi", "settings null ise tercih bilinmiyor (false)", evaluateSetupGuide(snap(null, {})).dismissed, false, "settings=null");

  // Sifir okunabilir bir cevaptir — susmaz
  ok("okunamadi", "sayimlarin hepsi 0 ise SUSMAZ", evalOk(snap(SEED_SETTINGS, {})).readable, true, "hepsi 0");
}

// ---------------------------------------------------------------------------
header("(c) Menu adimi — yalniz 0 ogede");
// ---------------------------------------------------------------------------
{
  // Menuyu kurulum tohumluyor (create-tenant, 5 oge). Dolu menuyu
  // "tamamlandi" diye listelemiyoruz: onu admin yapmadi, kurulum yapti.
  const seeded = evalOk(snap(SEED_SETTINGS, { menuItems: 5 }));
  okTrue("menu", "menu doluyken adim listede YOK", !idsOf(seeded).includes("menu"), "menuItems=5");
  ok("menu", "menu doluyken toplam 8", seeded.total, 8, "menuItems=5");

  const broken = evalOk(snap(SEED_SETTINGS, { menuItems: 0 }));
  ok("menu", "menu bosken adim EN BASTA", idsOf(broken)[0], "menu", "menuItems=0");
  ok("menu", "menu bosken toplam 9", broken.total, 9, "menuItems=0");
  ok("menu", "menu adimi acik", stepById(broken, "menu").done, false, "menuItems=0");
  ok("menu", "menu adimi menu ekranina goturur", stepById(broken, "menu").href, "/admin/menu", "menuItems=0");

  // Tek oge bile navbar'i calisir kilar
  okTrue("menu", "1 oge yeterli", !idsOf(evalOk(snap(SEED_SETTINGS, { menuItems: 1 }))).includes("menu"), "menuItems=1");
}

// ---------------------------------------------------------------------------
header("(d) Sira ve bagimlilik");
// ---------------------------------------------------------------------------
{
  const seed = evalOk(snap(SEED_SETTINGS, {}));
  const ids = idsOf(seed);
  const before = (a, b) => ids.indexOf(a) < ids.indexOf(b);

  okTrue("sira", "kategori haberden ONCE (haber editoru kategori istiyor)", before("kategori", "haber"), ids.join(","));
  okTrue("sira", "logo iletisimden once (1 dakikalik is once)", before("logo", "iletisim"), ids.join(","));
  okTrue("sira", "haber mansetten once ('Mansete Ekle' ikisini birden kapatir)", before("haber", "manset"), ids.join(","));
  okTrue("sira", "duyuru bolumlerden once (bolum icerik gosteriyor)", before("duyuru", "bolumler"), ids.join(","));
  okTrue("sira", "galeri en sonda", ids[ids.length - 1] === "galeri", ids.join(","));

  // Her adimin gidecegi ekran var ve panel icinde
  for (const s of seed.steps) {
    okTrue("hedef", `${s.id} → panel ici yol`, s.href.startsWith("/admin/"), s.href);
    okTrue("hedef", `${s.id} → buton metni dolu`, s.action.length > 0, s.action);
    okTrue("hedef", `${s.id} → aciklama dolu`, s.detail.length > 0, s.detail);
  }

  // Manset adimi kisayolu ANLATIR (teshis turu karari)
  okTrue("hedef", "manset metni 'Mansete Ekle' kisayolunu soyler", stepById(seed, "manset").detail.includes("Manşete Ekle"), "manset detail");

  // TON: suclayici sozluk buraya TASINMADI
  const allText = seed.steps.map((s) => `${s.label} ${s.detail} ${s.action}`).join(" ");
  for (const banned of ["Eksik", "Uyarı", "Hata", "Belirlenemedi", "yapmadın", "unuttun"]) {
    okTrue("ton", `"${banned}" gecmiyor`, !allText.includes(banned), banned);
  }
  // Panelde Ingilizce yok (b8 terminoloji sozlesmesi)
  for (const banned of ["Dashboard", "Setup", "Step", "Slider", "Header"]) {
    okTrue("ton", `Ingilizce "${banned}" gecmiyor`, !allText.includes(banned), banned);
  }
}

// ---------------------------------------------------------------------------
header("(e) Ilerleme ozeti");
// ---------------------------------------------------------------------------
{
  // Turkce iyelik eki rakamin OKUNUSUNA gore degisiyor (ucu, besi, altisi,
  // sekizi...) — tek sablonla uretilemez. "N tanesi" her rakamda dogru.
  ok("ozet", "hicbiri tamam degilse", summarizeSetupGuide(0, 8), "8 adım", "0/8");
  ok("ozet", "kismi ilerleme", summarizeSetupGuide(3, 8), "8 adımdan 3 tanesi tamam", "3/8");
  ok("ozet", "tek adim kaldi", summarizeSetupGuide(7, 8), "8 adımdan 7 tanesi tamam", "7/8");
  ok("ozet", "hepsi tamam", summarizeSetupGuide(8, 8), "Hepsi tamam", "8/8");
  ok("ozet", "9 adimli (menu bozuk) hal", summarizeSetupGuide(4, 9), "9 adımdan 4 tanesi tamam", "4/9");

  for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
    okTrue("ozet", `${n} icin kesme isaretli ek YOK`, !summarizeSetupGuide(n, 10).includes("'"), summarizeSetupGuide(n, 10));
  }

  // Sayim, listedeki done sayisiyla birebir
  const partial = evalOk(snap(DONE_SETTINGS, { ...DONE_COUNTS, news: 0, galleryAlbums: 0 }));
  ok("ozet", "doneCount listedeki done sayisi", partial.doneCount, partial.steps.filter((s) => s.done).length, "kismi");
  ok("ozet", "acik adimlar", openIds(partial), ["haber", "galeri"], "kismi");
  ok("ozet", "allDone false", partial.allDone, false, "kismi");
}

// ---------------------------------------------------------------------------
header("(f) Kapatma bayragi");
// ---------------------------------------------------------------------------
{
  ok("kapatma", "anahtar adi", SETUP_GUIDE_DISMISSED_KEY, "setup_guide_dismissed", "sabit");
  okTrue("kapatma", "okunan anahtarlar arasinda", SETUP_GUIDE_SETTING_KEYS.includes(SETUP_GUIDE_DISMISSED_KEY), SETUP_GUIDE_SETTING_KEYS.join(","));
  ok("kapatma", "okunan anahtarlar", [...SETUP_GUIDE_SETTING_KEYS], ["logo_url", "contact_phone", "contact_address", "setup_guide_dismissed"], "sabit");

  ok("kapatma", "bayrak yoksa gizli degil", evalOk(snap(SEED_SETTINGS, {})).dismissed, false, "bayrak yok");
  ok("kapatma", '"true" → gizli', evalOk(snap({ ...SEED_SETTINGS, setup_guide_dismissed: "true" }, {})).dismissed, true, "true");
  ok("kapatma", '"false" → gizli degil', evalOk(snap({ ...SEED_SETTINGS, setup_guide_dismissed: "false" }, {})).dismissed, false, "false");
  ok("kapatma", "null → gizli degil", evalOk(snap({ ...SEED_SETTINGS, setup_guide_dismissed: null }, {})).dismissed, false, "null");
  // Gizliyken de adimlar HESAPLANIR (geri acilinca dogru sayi gorunsun)
  ok("kapatma", "gizliyken adimlar yine hesaplanir", evalOk(snap({ ...SEED_SETTINGS, setup_guide_dismissed: "true" }, {})).total, 8, "gizli");
}

// ---------------------------------------------------------------------------
header("(g) Kardes liste tutarliligi");
// ---------------------------------------------------------------------------
{
  // Ayrisirsa iki panel birbirini yalanlar: super admin "varsayilan logo
  // duruyor" derken kurum paneli "tamam" gosterir.
  ok("kardes", "PLACEHOLDER_LOGO_URL iki tarafta AYNI", CHECKLIST_PLACEHOLDER, PLACEHOLDER_LOGO_URL, "constants vs setup-checklist");
  ok("kardes", "deger create-tenant tohumuyla ayni", PLACEHOLDER_LOGO_URL, "/placeholder-logo.png", "sabit");

  const createTenant = readFileSync("src/app/api/super-admin/create-tenant/route.ts", "utf8");
  okTrue("kardes", "create-tenant ayni tohumu yaziyor", createTenant.includes(`{ key: "logo_url", value: "${PLACEHOLDER_LOGO_URL}" }`), "create-tenant");
  okTrue("kardes", "create-tenant iletisim alanlarini BOS tohumluyor", createTenant.includes('{ key: "contact_phone", value: "" }') && createTenant.includes('{ key: "contact_address", value: "" }'), "create-tenant");

  const navbar = readFileSync("src/components/public/Navbar.tsx", "utf8");
  okTrue("kardes", "Navbar ayni sentinel'de harf avatarina duser", navbar.includes(`logoUrl === "${PLACEHOLDER_LOGO_URL}"`), "Navbar");

  const checklist = readFileSync("src/lib/super-admin/setup-checklist.ts", "utf8");
  okTrue("kardes", "setup-checklist degeri elle yazmiyor (import ediyor)", checklist.includes('import { PLACEHOLDER_LOGO_URL } from "../constants.ts";'), "setup-checklist");
  okTrue("kardes", "setup-checklist kardes listeyi belgeliyor", checklist.includes("setup-guide"), "setup-checklist");

  const guide = readFileSync("src/lib/setup-guide.ts", "utf8");
  okTrue("kardes", "setup-guide degeri elle yazmiyor (import ediyor)", guide.includes('import { PLACEHOLDER_LOGO_URL } from "./constants.ts";'), "setup-guide");
  okTrue("kardes", "setup-guide localStorage KULLANMIYOR", !stripComments(guide).includes("localStorage"), "setup-guide");
}

// ---------------------------------------------------------------------------
header("(h) Kod tutarliligi");
// ---------------------------------------------------------------------------
{
  const dash = readFileSync("src/app/admin/(authenticated)/page.tsx", "utf8");

  // b2 dersi: bagimsiz sorgular TEK dalgada. Ikinci bir Promise.all
  // (ya da ardisik await) derinligi 2'ye cikarir = +1 round trip.
  ok("dashboard", "TEK Promise.all dalgasi", (dash.match(/await Promise\.all\(/g) || []).length, 1, "dashboard");

  for (const table of ["news_categories", "menu_items", "homepage_sections", "headlines", "sliders", "site_settings"]) {
    okTrue("dashboard", `${table} sorgusu var`, dash.includes(`from("${table}")`), table);
  }
  // Haber/duyuru/galeri icin YENI sorgu acilmadi — mevcut sayaclar kullanildi
  ok("dashboard", "news sorgusu 2 (sayac + son 5), fazlasi yok", (dash.match(/from\("news"\)/g) || []).length, 2, "dashboard");
  ok("dashboard", "announcements sorgusu 2", (dash.match(/from\("announcements"\)/g) || []).length, 2, "dashboard");
  ok("dashboard", "gallery_albums sorgusu 1", (dash.match(/from\("gallery_albums"\)/g) || []).length, 1, "dashboard");

  // Pasif kayit ziyaretciye gorunmuyor → sayim is_active (public anasayfa
  // da ayni filtreyi uyguluyor). Super admin listesi filtresiz sayar.
  ok("dashboard", "is_active filtresi 3 sorguda (bolumler, manset, kapak)", (dash.match(/\.eq\("is_active", true\)/g) || []).length, 3, "dashboard");

  // Hata yutma duzeltmesi
  okTrue("dashboard", "sayac hatasi null'a duser (count || 0 YOK)", !/\.count \|\| 0/.test(stripComments(dash)), "dashboard");
  okTrue("dashboard", "readCount hata kontrolu yapiyor", dash.includes("return res.error ? null : (res.count ?? 0);"), "dashboard");
  okTrue("dashboard", "liste hatasinda ListLoadError", dash.includes("<ListLoadError"), "dashboard");
  okTrue("dashboard", "rehber bileseni bagli", dash.includes("<SetupGuide"), "dashboard");
  okTrue("dashboard", "kapatma site_settings'e yaziliyor", dash.includes("SETUP_GUIDE_DISMISSED_KEY") && dash.includes('onConflict: "tenant_id,key"'), "dashboard");
  okTrue("dashboard", "geri kapisi var", dash.includes("Kurulum rehberini göster"), "dashboard");
  okTrue("dashboard", "localStorage KULLANILMIYOR", !stripComments(dash).includes("localStorage"), "dashboard");

  const comp = readFileSync("src/components/admin/SetupGuide.tsx", "utf8");
  okTrue("bilesen", "okunamadi hali tek notr satir", comp.includes("Kurulum durumu okunamadı. Sayfayı yenileyin."), "SetupGuide");
  // Gizlilik kontrolu okunabilirlik kontrolunden ONCE olmali — sirasi
  // bozulursa gizlenmis rehber sorgu hatasinda konusur.
  okTrue("bilesen", "once gizlilik, sonra okunabilirlik kontrolu", stripComments(comp).indexOf("result.dismissed") < stripComments(comp).indexOf("!result.readable"), "SetupGuide");
  okTrue("bilesen", "kirmizi (text-error) kullanilmiyor", !stripComments(comp).includes("text-error"), "SetupGuide");
  // stripComments VAKUM DEGIL: yorum atilmazsa yukaridaki negatif kontrol
  // sahte PASS verir. Once yorumda GECTIGINI, sonra kodda GECMEDIGINI sina.
  okTrue("bilesen", "text-error yalniz YORUMDA geciyor (kontrol vakum degil)", comp.includes("text-error") && !stripComments(comp).includes("text-error"), "SetupGuide");
  okTrue("bilesen", "tamamlanmis hal tek satira iner", comp.includes("Site kurulumu tamamlandı."), "SetupGuide");
  okTrue("bilesen", "Gizle dugmesi var", comp.includes("Gizle"), "SetupGuide");

  // Capalar: rehber /admin/ayarlar#genel ve #iletisim'e yolluyor
  const ayarlar = readFileSync("src/app/admin/(authenticated)/ayarlar/page.tsx", "utf8");
  for (const anchor of ["genel", "iletisim", "sosyal-medya", "tema", "footer"]) {
    okTrue("capa", `#${anchor} bolumu var`, ayarlar.includes(`id="${anchor}"`), anchor);
  }
  okTrue("capa", "sticky header icin scroll-mt", ayarlar.includes("scroll-mt-20"), "ayarlar");
  okTrue("capa", "yukleme bitince elle kaydiriyor", ayarlar.includes("scrollIntoView"), "ayarlar");

  const seed = evalOk(snap(SEED_SETTINGS, {}));
  for (const s of seed.steps) {
    if (!s.href.includes("#")) continue;
    const anchor = s.href.split("#")[1];
    okTrue("capa", `${s.id} capasi ayarlar sayfasinda var`, ayarlar.includes(`id="${anchor}"`), s.href);
  }

  const help = readFileSync("src/lib/help-content.ts", "utf8");
  okTrue("yardim", "Ozet yardimi rehberi anlatiyor", help.includes("Başlangıç Adımları"), "help-content");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
