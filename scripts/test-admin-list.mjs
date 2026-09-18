/**
 * Admin liste sayfalamasinin saf mantigi — tablo testi (b1).
 *
 * CALISTIRMA:
 *   npm run test:admin-list
 *   (= node scripts/test-admin-list.mjs)
 *
 * NEDEN VAR:
 *   Sayfalamanin butun sinir durumlari URL'den ya da silme akisindan gelir ve
 *   ikisi de kullanicinin elinde: adres cubuguna "?sayfa=abc" yazilabilir,
 *   sayfanin SON satiri silinebilir. Bu iki yol hatali kurulursa panel ya bos
 *   tablo gosterir ya da sonsuz yonlendirme dongusune girer. Mantik React'ten
 *   ayri tutuldu (src/lib/admin-list.ts) ki burada dogrudan test edilebilsin.
 *
 * --conditions=react-server GEREKMIYOR: admin-list.ts saf string/sayi modulu,
 * "server-only" import etmiyor (test-sanitize.mjs'den farki bu).
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import {
  PAGE_PARAM,
  parsePageParam,
  buildListHref,
  lastPage,
  pageOverflowTarget,
  rangeFor,
} from "../src/lib/admin-list.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (test-parse-hostname.mjs ile ayni desen)
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
console.log("\nparsePageParam — adres cubuguna ne yazilirsa yazilsin");
// ---------------------------------------------------------------------------
esit("parametre yok -> 1", parsePageParam(null), 1);
esit("undefined -> 1", parsePageParam(undefined), 1);
esit("bos metin -> 1", parsePageParam(""), 1);
esit("harf -> 1", parsePageParam("abc"), 1);
esit("sifir -> 1", parsePageParam("0"), 1);
esit("negatif -> 1", parsePageParam("-5"), 1);
esit("ondalik -> taban", parsePageParam("1.9"), 1);
esit("normal", parsePageParam("3"), 3);
esit("bosluklu", parsePageParam(" 7 "), 7);
esit("sayi+harf -> sayi kismi", parsePageParam("12abc"), 12);
esit("cok buyuk sayi bozulmaz", parsePageParam("999999"), 999999);

// ---------------------------------------------------------------------------
console.log("\nbuildListHref — 1. sayfada ?sayfa DUSER, diger parametreler KALIR");
// ---------------------------------------------------------------------------
esit(
  "1. sayfa -> temiz adres",
  buildListHref("/admin/haberler", "", 1),
  "/admin/haberler"
);
esit(
  "2. sayfa",
  buildListHref("/admin/haberler", "", 2),
  "/admin/haberler?sayfa=2"
);
esit(
  "1. sayfaya donunce ?sayfa silinir",
  buildListHref("/admin/haberler", "sayfa=5", 1),
  "/admin/haberler"
);
esit(
  "mevcut sayfa parametresi EZILIR (iki kez yazilmaz)",
  buildListHref("/admin/haberler", "sayfa=5", 3),
  "/admin/haberler?sayfa=3"
);
esit(
  "bilinmeyen parametre KORUNUR",
  buildListHref("/admin/haberler", "durum=taslak", 2),
  "/admin/haberler?durum=taslak&sayfa=2"
);
esit(
  "bilinmeyen parametre 1. sayfada da korunur",
  buildListHref("/admin/haberler", "durum=taslak&sayfa=4", 1),
  "/admin/haberler?durum=taslak"
);
esit("parametre adi public tarafla ayni", PAGE_PARAM, "sayfa");

// ---------------------------------------------------------------------------
console.log("\nlastPage — toplam kayittan son sayfa");
// ---------------------------------------------------------------------------
esit("bos liste -> 1 (sifir degil)", lastPage(0, 20), 1);
esit("tam dolu tek sayfa", lastPage(20, 20), 1);
esit("bir fazlasi -> 2 sayfa", lastPage(21, 20), 2);
esit("bugunku canli hacim (9 haber)", lastPage(9, 20), 1);
esit("2.000 kayit", lastPage(2000, 20), 100);
esit("negatif toplam -> 1", lastPage(-3, 20), 1);
esit("pageSize 0 -> 1 (bolme hatasi yok)", lastPage(100, 0), 1);

// ---------------------------------------------------------------------------
console.log("\npageOverflowTarget — son satir silindi / ?sayfa=999");
// ---------------------------------------------------------------------------
esit("sorun yok -> null", pageOverflowTarget(1, 100, 20), null);
esit("son sayfada sorun yok -> null", pageOverflowTarget(5, 100, 20), null);
esit(
  "5. sayfanin son satiri silindi -> 4. sayfaya in",
  pageOverflowTarget(5, 80, 20),
  4
);
esit("?sayfa=999 -> son gecerli sayfa", pageOverflowTarget(999, 100, 20), 5);
esit(
  "liste tamamen bosaldi -> 1. sayfa",
  pageOverflowTarget(3, 0, 20),
  1
);

// 🔴 DONGU KORUMASI: donen hedef HER ZAMAN page'ten kucuk olmali, yoksa
// replace -> fetch -> replace sonsuz donguye girer.
{
  let dongusuz = true;
  for (let page = 1; page <= 50; page++) {
    for (const total of [0, 1, 19, 20, 21, 99, 100, 101, 2000]) {
      const hedef = pageOverflowTarget(page, total, 20);
      if (hedef !== null && hedef >= page) dongusuz = false;
    }
  }
  esit("hedef her zaman page'ten KUCUK (dongu olmaz)", dongusuz, true);
}

// Tasma duzeltmesi TEK adimda bitmeli: inilen sayfa artik tasmamali.
{
  let tekAdim = true;
  for (let page = 1; page <= 50; page++) {
    for (const total of [0, 1, 19, 20, 21, 99, 100, 101, 2000]) {
      const hedef = pageOverflowTarget(page, total, 20);
      if (hedef !== null && pageOverflowTarget(hedef, total, 20) !== null) {
        tekAdim = false;
      }
    }
  }
  esit("duzeltme TEK adimda oturur", tekAdim, true);
}

// ---------------------------------------------------------------------------
console.log("\nrangeFor — Supabase .range() sinirlari (iki uc dahil)");
// ---------------------------------------------------------------------------
esit("1. sayfa", rangeFor(1, 20), { from: 0, to: 19 });
esit("2. sayfa", rangeFor(2, 20), { from: 20, to: 39 });
esit("100. sayfa", rangeFor(100, 20), { from: 1980, to: 1999 });
esit("sayfa basi kayit sayisi = pageSize", rangeFor(3, 20).to - rangeFor(3, 20).from + 1, 20);

// Sayfalar BITISIK olmali: bosluk ya da cakisma = kayip/tekrarlanan satir.
{
  let bitisik = true;
  for (let page = 1; page < 200; page++) {
    if (rangeFor(page, 20).to + 1 !== rangeFor(page + 1, 20).from) bitisik = false;
  }
  esit("ardisik sayfalar bitisik (satir kaybi/tekrari yok)", bitisik, true);
}

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failed} kaldi\n`);
process.exit(failed === 0 ? 0 : 1);
