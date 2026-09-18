/**
 * Tenant cache etiketleri — tablo testi (b3).
 *
 * CALISTIRMA:
 *   npm run test:tenant-cache
 *   (= node scripts/test-tenant-cache.mjs)
 *
 * NEDEN VAR:
 *   b3'un yapilma SARTI `revalidateTag`'di: onsuz pasife alinan bir kurum
 *   TTL boyunca (60 sn) yayinda kalir. Ama `revalidateTag` ancak DOGRU
 *   etiketle cagrilirsa ise yarar — ve bu sessizce yanlis gidebilir:
 *   `revalidateTag("tenant:Kurmay")` hicbir hata vermez, sadece HICBIR SEYI
 *   gecersizlestirmez.
 *
 *   En kolay unutulan hata: **slug DEGISTIGINDE eski etiketi temizlememek**.
 *   O zaman eski adres 60 sn boyunca eski kaydi gostermeye devam eder.
 *
 *   Bu test Next'in cache makinesini DEGIL, `tenantTag` / `tenantTagsForUpdate`
 *   KARARINI siniyor — mantik React/Next'ten ayri tutuldugu icin dogrudan
 *   calistirilabiliyor (src/lib/tenant-cache.ts).
 *
 * --conditions=react-server GEREKMIYOR: tenant-cache.ts saf string modulu.
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import {
  TENANT_TAG_PREFIX,
  tenantTag,
  tenantTagsForUpdate,
} from "../src/lib/tenant-cache.ts";

// ---------------------------------------------------------------------------
let passed = 0;
let failed = 0;

function esit(ad, gercek, beklenen) {
  const a = JSON.stringify(gercek);
  const b = JSON.stringify(beklenen);
  if (a === b) {
    passed++;
    console.log(`  PASS  ${ad}`);
  } else {
    failed++;
    console.log(`  FAIL  ${ad}\n        beklenen: ${b}\n        gercek  : ${a}`);
  }
}

// ---------------------------------------------------------------------------
console.log("\ntenantTag — etiket uretimi");
// ---------------------------------------------------------------------------
esit("normal slug", tenantTag("kurmay-teknoloji"), "tenant:kurmay-teknoloji");
esit("default", tenantTag("default"), "tenant:default");
esit("onek sabiti kullaniliyor", tenantTag("x"), `${TENANT_TAG_PREFIX}:x`);

// 🔴 Normalizasyon: update-tenant govdeden gelen slug'i trim+lowercase
// ediyor, x-tenant-slug ise parseHostname'den kucuk harf geliyor. Ikisi
// ayni etikete dusmezse revalidateTag ISABET ETMEZ.
esit("buyuk harf normalize", tenantTag("Kurmay"), "tenant:kurmay");
esit("bosluk kirpilir", tenantTag("  metalsen  "), "tenant:metalsen");
esit("karisik", tenantTag("  MetalSen "), "tenant:metalsen");

// Gecersiz girdide null — cagiran taraf revalidateTag CAGIRMAMALI.
// Bos etiket hicbir seyi gecersizlestirmez ama "temizledim" yanilgisi verir.
esit("bos metin -> null", tenantTag(""), null);
esit("yalniz bosluk -> null", tenantTag("   "), null);
esit("null -> null", tenantTag(null), null);
esit("undefined -> null", tenantTag(undefined), null);
esit("sayi -> null", tenantTag(123), null);

// ---------------------------------------------------------------------------
console.log("\ntenantTagsForUpdate — slug degisimi (asil tuzak)");
// ---------------------------------------------------------------------------
esit(
  "slug DEGISMEDI -> tek etiket",
  tenantTagsForUpdate("metalsen", "metalsen"),
  ["tenant:metalsen"]
);
esit(
  "🔴 slug DEGISTI -> ESKI VE YENI birlikte",
  tenantTagsForUpdate("eski-ad", "yeni-ad"),
  ["tenant:eski-ad", "tenant:yeni-ad"]
);
esit(
  "yalniz buyuk/kucuk harf farki -> tekillestirilir",
  tenantTagsForUpdate("Metalsen", "metalsen"),
  ["tenant:metalsen"]
);
esit(
  "bosluk farki -> tekillestirilir",
  tenantTagsForUpdate(" metalsen", "metalsen "),
  ["tenant:metalsen"]
);
esit(
  "eski slug bos -> yalniz yeni",
  tenantTagsForUpdate("", "yeni-ad"),
  ["tenant:yeni-ad"]
);
esit(
  "ikisi de bos -> bos liste (revalidateTag hic cagrilmaz)",
  tenantTagsForUpdate("", ""),
  []
);

// 🔴 EN ONEMLI GARANTI: slug degistiginde ESKI etiket listede OLMAK ZORUNDA.
// Bu dusmezse eski adres TTL boyunca eski veriyi gosterir.
{
  let hepsindeEskiVar = true;
  const ciftler = [
    ["a", "b"],
    ["kurmay-teknoloji", "kurmay"],
    ["default", "varsayilan"],
    ["uzun-bir-slug-adi", "kisa"],
    ["Metalsen", "metal-sen"],
  ];
  for (const [eski, yeni] of ciftler) {
    const tags = tenantTagsForUpdate(eski, yeni);
    if (!tags.includes(tenantTag(eski))) hepsindeEskiVar = false;
    if (!tags.includes(tenantTag(yeni))) hepsindeEskiVar = false;
  }
  esit("slug degisen her ciftte ESKI+YENI ikisi de var", hepsindeEskiVar, true);
}

// Etiket formati: revalidateTag string bekliyor, ayirici ':' olmali ve
// etikette bosluk kalmamali (bosluklu etiket sessizce eslesmez).
{
  let bicimTemiz = true;
  for (const s of ["a", "uzun-slug", " Bosluklu ", "UPPER"]) {
    const t = tenantTag(s);
    if (t === null) continue;
    if (!t.startsWith(`${TENANT_TAG_PREFIX}:`)) bicimTemiz = false;
    if (/\s/.test(t)) bicimTemiz = false;
    if (t !== t.toLowerCase()) bicimTemiz = false;
  }
  esit("etiket bicimi temiz (onek + bosluksuz + kucuk harf)", bicimTemiz, true);
}

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failed} kaldi\n`);
process.exit(failed === 0 ? 0 : 1);
