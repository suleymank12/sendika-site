/**
 * PAYLASIM GORSELI (og:image / twitter:image) testi — 20 Eylul 2026.
 *
 * CALISTIRMA:
 *   npm run test:og-image
 *   (= node scripts/test-og-image.mjs)
 *
 * ## DURUM NEYDI (teshis, olcumle)
 *
 * NOTE.md'de "public/ klasoru yok -> og:image 404" diye bir kayit vardi.
 * Olcum bu kaydi CURUTTU: `DEFAULT_META.OG_IMAGE` sabiti HICBIR yerde
 * kullanilmiyordu, yani canlida oyle bir etiket hic yazilmadi. Gercek
 * durum baskaydi (yerel dev sunucuda render edilen HTML'den okundu):
 *
 *   sayfa                         og:image
 *   haber/duyuru/albüm detayi     VAR  (ham Storage adresi, 71 KB - 2709 KB)
 *   kapaksiz haber                YOK
 *   anasayfa + tum genel sayfalar YOK   <- ciplak link
 *
 * Yani asil sorun 404 degil, (1) genel sayfalarda gorselin HIC olmamasi,
 * (2) olanlarin da ham/devasa (2.7 MB) ve bazilarinin webp olmasi.
 *
 * ## BU TEST NEYI DOGRULAR
 *
 *   (a) buildOgImageUrl — sentinel / goreli / bos degerler ELENIR,
 *       Storage adresleri Next'in gorsel ucuna alinir
 *   (b) pickOgImage — oncelik zinciri (icerigin kapagi -> kurumun logosu)
 *   (c) seo.ts — zinciri kuruyor, sirayi bozmuyor, sabit gorsel yok
 *   (d) layout.tsx — kok emniyet agi KURUMUN logosundan besleniyor
 *   (e) next.config — remotePatterns + deviceSizes sozlesmesi
 *   (f) constants — DEFAULT_META (ve sentinel'li OG_IMAGE) KALDIRILDI
 *   (g) detay sayfalari kendi kapaklarini GECIRIYOR (regresyon muhru)
 *
 * ## CANLI OLCUMLER (20 Eylul 2026)
 *
 * `/_next/image` robot taklidiyle (facebookexternalhit, WhatsApp,
 * Twitterbot, TelegramBot; Accept basliginda webp YOK):
 *   4 robotun 4'u de HTTP 200 · 2709 KB -> 157 KB · webp -> JPEG
 *   band 8-161 KB · ilk istek <= 0.8 sn, sonrasi onbellekten
 *   w=1201 -> 400 (deviceSizes listesi) · yabanci kaynak -> 400
 *   Supabase'in kendi donusum ucu -> 403 (Pro ozelligi, FREE'deyiz)
 *
 * Uretim modunda (`next build` + `next start`) render edilen HTML:
 *   default kurum -> http://lvh.me:3000/_next/image?...
 *   Kurmay        -> https://kurmayteknoloji.com/_next/image?...   <- KENDI domaini
 *   Kurmay anasayfa (logosu sentinel) -> og:image etiketi HIC YOK
 *
 * ⚠️ GELISTIRMEDE ADRES localhost GORUNUR — panik yapma: Next dev'de
 * sosyal gorselleri HER ZAMAN `http://localhost:3000`'e cozuyor
 * (`next/dist/lib/metadata/resolvers/resolve-url.js` ->
 * `getSocialImageFallbackMetadataBase`, NODE_ENV === "development" dali).
 * Uretimde `metadataBase` kullanilir; yukaridaki olcum bunu gosteriyor.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir.
 */

import { readFileSync } from "node:fs";
import {
  NEXT_IMAGE_PATH,
  OG_IMAGE_QUALITY,
  OG_IMAGE_WIDTH,
  buildOgImageUrl,
  isOptimizableStorageUrl,
  pickOgImage,
} from "../src/lib/og-image.ts";
import { PLACEHOLDER_LOGO_URL } from "../src/lib/constants.ts";

// Gorsel ucu YALNIZ bizim projemizi kabul ediyor (storage-host.ts,
// 21 Eylul 2026). Kural env'i cagri aninda okuyor; test projesi "ornek".
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";

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

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*)/.test(line))
    .join("\n");
}

function comesBefore(src, a, b) {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b);
  return ia !== -1 && ib !== -1 && ia < ib;
}

const STORAGE = "https://ornek.supabase.co/storage/v1/object/public/images/t1/news/a.jpg";
const SEO = "src/lib/seo.ts";
const LAYOUT = "src/app/layout.tsx";

// ---------------------------------------------------------------------------
header("(a) buildOgImageUrl — elenenler ve cevrilenler");
// ---------------------------------------------------------------------------
{
  // 🔴 EN KRITIK VAKA: sentinel. Canli olcumde Kurmay'in logo_url degeri
  //    tam olarak buydu; elenmezse og:image kurumun kendi alan adinda
  //    /placeholder-logo.png olur ve 404 verir (public/ klasoru YOK).
  ok("eleme", "🔴 sentinel elenir", buildOgImageUrl(PLACEHOLDER_LOGO_URL), null, PLACEHOLDER_LOGO_URL);
  ok("eleme", "sentinel degeri degismedi", PLACEHOLDER_LOGO_URL, "/placeholder-logo.png", "constants");
  ok("eleme", "null elenir", buildOgImageUrl(null), null, "null");
  ok("eleme", "undefined elenir", buildOgImageUrl(undefined), null, "undefined");
  ok("eleme", "bos metin elenir", buildOgImageUrl(""), null, '""');
  ok("eleme", "yalniz bosluk elenir", buildOgImageUrl("   "), null, '"   "');
  ok("eleme", "goreli adres elenir", buildOgImageUrl("/logo.png"), null, "/logo.png");
  ok("eleme", "goreli (nokta) adres elenir", buildOgImageUrl("./a.png"), null, "./a.png");
  ok("eleme", "protokolsuz adres elenir", buildOgImageUrl("//cdn.test/a.png"), null, "//cdn.test/a.png");
  ok("eleme", "metin olmayan deger elenir", buildOgImageUrl(42), null, "42");

  const cikti = buildOgImageUrl(STORAGE);
  ok(
    "cevirme",
    "Storage adresi gorsel ucuna alinir",
    cikti,
    `${NEXT_IMAGE_PATH}?url=${encodeURIComponent(STORAGE)}&w=${OG_IMAGE_WIDTH}&q=${OG_IMAGE_QUALITY}`,
    STORAGE
  );
  okTrue("cevirme", "adres goreli baslar (metadataBase cozecek)", cikti.startsWith("/_next/image?"), cikti);
  ok(
    "cevirme",
    "kaynak adres kodlamadan aynen geri okunur",
    new URLSearchParams(cikti.split("?")[1]).get("url"),
    STORAGE,
    cikti
  );
  ok("cevirme", "genislik 1200", OG_IMAGE_WIDTH, 1200, "sabit");
  ok("cevirme", "kalite 75", OG_IMAGE_QUALITY, 75, "sabit");
  okTrue("cevirme", "bosluklar kirpilir", buildOgImageUrl(`  ${STORAGE}  `) === cikti, "bosluklu");

  // Bizim Storage'imiz disindaki MUTLAK adres: uc 400 doner, ham adres calisir.
  ok(
    "cevirme",
    "yabanci mutlak adres HAM birakilir",
    buildOgImageUrl("https://baska.test/a.jpg"),
    "https://baska.test/a.jpg",
    "yabanci"
  );
  ok(
    "cevirme",
    "supabase ama public olmayan yol HAM birakilir",
    buildOgImageUrl("https://ornek.supabase.co/storage/v1/object/sign/images/a.jpg"),
    "https://ornek.supabase.co/storage/v1/object/sign/images/a.jpg",
    "imzali yol"
  );

  // Host kontrolu: ".supabase.co" ile BITMELI — benzeri adresler gecmemeli.
  okTrue(
    "cevirme",
    "🔴 sahte host (supabase.co.saldirgan.test) optimize EDILMEZ",
    !isOptimizableStorageUrl("https://supabase.co.saldirgan.test/storage/v1/object/public/a.jpg"),
    "sahte host"
  );
  // 🔴 Bu vaka `endsWith` yerine `includes` yazilirsa KIRILIR: asagidaki
  //    host ".supabase.co" dizesini ICERIR ama onunla BITMEZ. Mutasyon
  //    testinde yakalanmasi gereken tam olarak bu fark.
  okTrue(
    "cevirme",
    "🔴 sahte alt alan (x.supabase.co.saldirgan.test) optimize EDILMEZ",
    !isOptimizableStorageUrl("https://x.supabase.co.saldirgan.test/storage/v1/object/public/a.jpg"),
    "sahte alt alan"
  );
  // 🔴 21 Eylul 2026: ".supabase.co ile bitmek" ARTIK YETMEZ. Baska bir
  //    projenin adresi optimize edilmez, HAM birakilir (uc onu 400'le
  //    reddederdi; ham adres ise calisir).
  const BASKA_PROJE = "https://saldirgan.supabase.co/storage/v1/object/public/images/a.avif";
  okTrue("cevirme", "🔴 BASKA Supabase projesi optimize EDILMEZ", !isOptimizableStorageUrl(BASKA_PROJE), BASKA_PROJE);
  ok("cevirme", "BASKA proje adresi HAM birakilir", buildOgImageUrl(BASKA_PROJE), BASKA_PROJE, BASKA_PROJE);
  okTrue("cevirme", "http:// Storage adresi optimize edilmez", !isOptimizableStorageUrl(STORAGE.replace("https", "http")), "http");
  okTrue("cevirme", "gecerli Storage adresi optimize edilir", isOptimizableStorageUrl(STORAGE), STORAGE);
  okTrue("cevirme", "bozuk adres cokmez", isOptimizableStorageUrl("bu bir adres degil") === false, "bozuk");

  // 🔴 SENTINEL ELEMESI KAYNAKTAN DA MUHURLU.
  //    Davranis testi tek basina yetmiyor: bugunku sentinel GORELI oldugu
  //    icin alttaki "https?:// degilse ele" kurali onu zaten yakaliyor —
  //    yani sentinel satiri silinse test yine gecerdi (mutasyon testinde
  //    olculdu). Sabit yarin MUTLAK bir adrese cevrilirse (ornegin
  //    Storage'a konan gercek bir placeholder) o koruma yok olurdu.
  //    Bu yuzden satirin VARLIGI ve SIRASI ayrica dogrulanir.
  const ogKaynak = read("src/lib/og-image.ts");
  okTrue(
    "eleme",
    "🔴 sentinel elemesi kaynakta duruyor",
    ogKaynak.includes("if (raw === PLACEHOLDER_LOGO_URL) return null;"),
    "og-image.ts"
  );
  okTrue(
    "eleme",
    "sentinel elemesi goreli-adres kuralindan ONCE",
    comesBefore(ogKaynak, "if (raw === PLACEHOLDER_LOGO_URL)", "test(raw)) return null;"),
    "sira"
  );
  okTrue(
    "eleme",
    "sentinel TEK KAYNAKTAN geliyor (elle yazilmamis)",
    ogKaynak.includes('import { PLACEHOLDER_LOGO_URL } from "./constants.ts"') &&
      !ogKaynak.includes('=== "/placeholder-logo.png"'),
    "tek kaynak"
  );
}

// ---------------------------------------------------------------------------
header("(b) pickOgImage — oncelik zinciri");
// ---------------------------------------------------------------------------
{
  const LOGO = "https://ornek.supabase.co/storage/v1/object/public/images/t1/branding/l.png";

  ok(
    "zincir",
    "icerigin kapagi kazanir",
    new URLSearchParams(pickOgImage(STORAGE, LOGO).split("?")[1]).get("url"),
    STORAGE,
    "kapak + logo"
  );
  ok(
    "zincir",
    "kapak yoksa KURUMUN logosuna duser",
    new URLSearchParams(pickOgImage(null, LOGO).split("?")[1]).get("url"),
    LOGO,
    "null + logo"
  );
  ok(
    "zincir",
    "🔴 kapak sentinel ise logoya duser (sentinel kazanamaz)",
    new URLSearchParams(pickOgImage(PLACEHOLDER_LOGO_URL, LOGO).split("?")[1]).get("url"),
    LOGO,
    "sentinel + logo"
  );
  ok("zincir", "🔴 logo da sentinel ise hicbiri", pickOgImage(null, PLACEHOLDER_LOGO_URL), null, "null + sentinel");
  ok("zincir", "aday yoksa null", pickOgImage(null, undefined, ""), null, "bos zincir");
  ok("zincir", "hic aday verilmezse null", pickOgImage(), null, "(bos)");
}

// ---------------------------------------------------------------------------
header("(c) seo.ts — zincir kodda dogru kurulmus mu");
// ---------------------------------------------------------------------------
{
  const seo = read(SEO);
  const kod = stripComments(seo);

  okTrue("seo", "pickOgImage import ediliyor", kod.includes('from "@/lib/og-image"'), SEO);
  okTrue("seo", "zincir kuruluyor", kod.includes("pickOgImage(input.image, map.logo_url)"), SEO);
  okTrue(
    "seo",
    "🔴 sira: once icerigin kapagi, sonra logo",
    comesBefore(kod, "pickOgImage(input.image", "map.logo_url)") ||
      kod.includes("pickOgImage(input.image, map.logo_url)"),
    "sira"
  );
  okTrue("seo", "og:image sonuctan yaziliyor", kod.includes("ogImage && { images: [{ url: ogImage"), SEO);
  okTrue("seo", "alt metni sayfa basligi", kod.includes("alt: ogTitle"), SEO);
  // Ham input.image ARTIK dogrudan kullanilmamali (aksi halde 2.7 MB'lik
  // ham adres ve sentinel yeniden sizar).
  okTrue("seo", "🔴 ham input.image dogrudan yazilmiyor", !kod.includes("url: input.image"), SEO);
  okTrue(
    "seo",
    "sabit/platform geneli gorsel yok",
    !kod.includes("placeholder-logo") && !kod.includes("DEFAULT_META"),
    SEO
  );
  okTrue(
    "seo",
    "logo KURUMUN ayarlarindan (map) geliyor",
    kod.includes("const map = await getSiteSettings(tenant.id)"),
    "cok kiracili"
  );
}

// ---------------------------------------------------------------------------
header("(d) layout.tsx — kok emniyet agi");
// ---------------------------------------------------------------------------
{
  const layout = read(LAYOUT);
  const kod = stripComments(layout);

  okTrue("kok", "pickOgImage import ediliyor", kod.includes('from "@/lib/og-image"'), LAYOUT);
  okTrue("kok", "logo KURUMUN ayarlarindan", kod.includes("pickOgImage(map.logo_url)"), LAYOUT);
  okTrue("kok", "openGraph icinde yaziliyor", comesBefore(kod, "openGraph: {", "pickOgImage(map.logo_url)"), "yer");
  okTrue("kok", "sabit gorsel yok", !kod.includes("placeholder-logo") && !kod.includes("DEFAULT_META"), LAYOUT);
  // metadataBase kuruma gore: og:image mutlaklastirmasi buna bagli.
  okTrue(
    "kok",
    "🔴 metadataBase kurumdan uretiliyor (mutlak adresin kaynagi)",
    kod.includes("metadataBase: new URL(buildTenantPublicUrl(tenant))"),
    "mutlak adres"
  );
}

// ---------------------------------------------------------------------------
header("(e) next.config — gorsel ucu sozlesmesi");
// ---------------------------------------------------------------------------
{
  const cfg = read("next.config.mjs");

  // 21 Eylul 2026: joker KALDIRILDI; host env'den turetiliyor. Davranis
  // esitligi (config ↔ storage-host) test:gorsel-zinciri'nde, config
  // gercekten yuklenerek sinaniyor.
  okTrue("config", "🔴 joker (*.supabase.co) YOK", !stripComments(cfg).includes("*.supabase.co"), "remotePatterns");
  okTrue("config", "host env'den turetiliyor", cfg.includes("hostname: ownStorageHostname()"), "remotePatterns");
  okTrue(
    "config",
    "yalniz public storage yolu izinli",
    cfg.includes('pathname: "/storage/v1/object/public/**"'),
    "remotePatterns"
  );
  // 🔴 deviceSizes TANIMLANMAMALI: varsayilan liste 1200'u iceriyor,
  //    ozel bir liste tanimlanirsa /_next/image?w=1200 -> 400 olur ve
  //    TUM paylasim gorselleri sessizce olur (olculdu: w=1201 -> 400).
  okTrue("config", "🔴 deviceSizes tanimlanmamis (varsayilan liste gecerli)", !cfg.includes("deviceSizes"), "next.config");
  const NEXT_VARSAYILAN_DEVICE_SIZES = [640, 750, 828, 1080, 1200, 1920, 2048, 3840];
  okTrue(
    "config",
    "genislik varsayilan listede",
    NEXT_VARSAYILAN_DEVICE_SIZES.includes(OG_IMAGE_WIDTH),
    String(OG_IMAGE_WIDTH)
  );
}

// ---------------------------------------------------------------------------
header("(f) constants — DEFAULT_META kaldirildi");
// ---------------------------------------------------------------------------
{
  const sabitler = read("src/lib/constants.ts");
  const kod = stripComments(sabitler);

  okTrue("sabit", "🔴 DEFAULT_META kodda YOK", !kod.includes("DEFAULT_META"), "constants.ts");
  okTrue("sabit", "OG_IMAGE sabiti YOK", !kod.includes("OG_IMAGE"), "constants.ts");
  okTrue("sabit", "sentinel duruyor (logo mantigi ona bagli)", kod.includes("PLACEHOLDER_LOGO_URL"), "constants.ts");
}

// ---------------------------------------------------------------------------
header("(g) Detay sayfalari kendi kapagini geciriyor (regresyon muhru)");
// ---------------------------------------------------------------------------
{
  const sayfalar = [
    ["src/app/(public)/haberler/[slug]/page.tsx", "image: data.cover_image"],
    ["src/app/(public)/duyurular/[slug]/page.tsx", "image: data.cover_image"],
    ["src/app/(public)/galeri/[albumId]/page.tsx", "image: data.cover_image"],
    ["src/app/(public)/manset/[id]/page.tsx", "image: data.image_url"],
    ["src/app/(public)/yonetim-kurulu/[slug]/page.tsx", "image: data.photo"],
  ];
  for (const [yol, beklenen] of sayfalar) {
    const src = stripComments(read(yol));
    okTrue("sayfa", `${yol.split("/").slice(-2).join("/")} -> ${beklenen}`, src.includes(beklenen), yol);
  }
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
