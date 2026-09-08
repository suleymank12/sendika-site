/**
 * Storage sahiplik guard'i testi — 9 Eylul 2026 "manset silinince haberin
 * kapagi da silindi" bug'ini kilitler.
 *
 * CALISTIRMA:
 *   npm run test:storage
 *   (= node scripts/test-storage-ownership.mjs)
 *
 * BUG NEYDI (regresyon kaydi):
 *   Haberden uretilen manset, haberin cover_image URL'ini KOPYALAR — dosya
 *   kopyalanmaz. Iki DB satiri tek fiziksel dosyayi gosterir:
 *       news.cover_image  = ".../images/{tenant}/news/kapak.webp"
 *       headlines.image_url = ayni URL
 *   Manset silinirken (manset/page.tsx handleDelete) veya mansetin gorseli
 *   degistirilirken (handleSave -> cleanupReplacedFile) bu dosya storage'dan
 *   kaldiriliyordu. Sonuc: HABER duruyor ama kapagi 404. Public bucket,
 *   versiyonlama yok -> geri getirilemez.
 *
 *   URL kopyalamanin UC tetikleyicisi vardi:
 *     1) haberler/[id] + duyurular/[id] otomatik manset senkronu
 *        (image_url: coverImage) — en yaygin yol
 *     2) manset/page.tsx handleSourceSelect (item.cover_image)
 *     3) manset modalinda gorseli degistirme / kaynagi degistirme /
 *        ImageUploader'da X'e basma
 *
 * COZUM (bu testin kilitledigi davranis):
 *   Her modul kendi klasorune yukler ({tenant_id}/{folder}/{dosya}).
 *   isOwnedPath() ile bir modul YALNIZCA kendi klasorundeki dosyayi siler.
 *   Manset icin sahip klasor: "headlines" (segment bazli oldugu icin
 *   "headlines/videos"i de kapsar). "news" ona ait DEGIL -> silinmez.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) isOwnedPath — segment bazli sahiplik, prefix yanilmasi yok, fail-safe
 *   (b) removeFilesFromStorage — headlines/ SILINIR, news/ SILINMEZ;
 *       .remove()'a giden argumanlar sahte client uzerinden GERCEKTEN olculur
 *   (c) cleanupReplacedFile — replace yolu da guard'li (bug'in 3. tetikleyicisi)
 *   (d) ownerFolders verilmezse eski davranis korunur (geriye uyumluluk)
 *   (e) Path'ler tam prefix'li ({tenant_id}/{folder}/{dosya}) uzerinden
 *       calisir — tenant prefix'i 017 ile geldi, guard onu atlamamali
 *
 * ⚠️ KAPSAM SINIRI (bilincli):
 *   Repoda React test kosucusu yok. Asagidaki HEADLINE_OWNED_FOLDERS sabiti,
 *   manset/page.tsx'teki ayni adli sabitin kopyasidir. Oradaki deger
 *   degisirse BURASI DA guncellenmeli. Guard'in kendisi (isOwnedPath ve
 *   removeFilesFromStorage) gercek kaynaktan import edilir — simule edilmez.
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import {
  isOwnedPath,
  removeFilesFromStorage,
  cleanupReplacedFile,
  buildStoragePath,
  storagePathFromUrl,
} from "../src/lib/storage.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (test-tenant-resolve.mjs / test-sanitize.mjs deseni)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

/** @param {string} group @param {string} name @param {unknown} actual @param {unknown} expected @param {string} input */
function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name, input, out: a, problems: [`beklenen ${e}`] });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

// ---------------------------------------------------------------------------
// Sahte Supabase storage client — .remove()'a GIDEN path'leri KAYDEDER
// ---------------------------------------------------------------------------
function makeFakeClient() {
  const removeCalls = [];
  return {
    removeCalls,
    /** .remove() hic cagrilmadiysa [] doner; cagrildiysa her cagri bir eleman */
    get removedPaths() {
      return removeCalls.flatMap((c) => c.paths);
    },
    storage: {
      from(bucket) {
        return {
          remove: async (paths) => {
            removeCalls.push({ bucket, paths });
            // Supabase remove() basarida silinen nesneleri doner
            return { data: paths.map((name) => ({ name })), error: null };
          },
        };
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Sabitler — gercek dunyadaki sekiller
// ---------------------------------------------------------------------------
const TENANT = "a1b2c3d4-0000-4000-8000-000000000001";
const SUPABASE = "https://xyzproject.supabase.co";

/** manset/page.tsx'teki HEADLINE_OWNED_FOLDERS'in kopyasi (bkz. kapsam siniri) */
const HEADLINE_OWNED_FOLDERS = ["headlines"];

/** @param {string} folder @param {string} file */
const path = (folder, file) => buildStoragePath(TENANT, folder, file);
/** @param {string} p */
const url = (p) => `${SUPABASE}/storage/v1/object/public/images/${p}`;

// Haberin kapagi — manset bunun URL'ini KOPYALAR
const NEWS_COVER = path("news", "1757000000000-abc123.webp");
// Mansetin KENDI yukledigi kapak
const HEADLINE_COVER = path("headlines", "1757000000001-def456.webp");
// Mansetin kendi videosu
const HEADLINE_VIDEO = path("headlines/videos", "1757000000002-ghi789.mp4");

// ---------------------------------------------------------------------------
console.log("\n(a) isOwnedPath — segment bazli sahiplik\n");

/** @param {string} name @param {string} p @param {string[]} owners @param {boolean} expected */
function checkOwned(name, p, owners, expected) {
  ok("owned", name, isOwnedPath(p, owners), expected, `${p} ⊂ [${owners}]`);
}

// ⬇ ASIL BUG: bu satir true donerse bug geri gelmistir
checkOwned("news/ manset'e AIT DEGIL", NEWS_COVER, HEADLINE_OWNED_FOLDERS, false);
checkOwned("headlines/ manset'e ait", HEADLINE_COVER, HEADLINE_OWNED_FOLDERS, true);
checkOwned("headlines/videos manset'e ait", HEADLINE_VIDEO, HEADLINE_OWNED_FOLDERS, true);

// Diger modullerin dosyalari da manset'e ait degil
checkOwned("announcements/ ait degil", path("announcements", "x.webp"), HEADLINE_OWNED_FOLDERS, false);
checkOwned("news/gallery ait degil", path("news/gallery", "x.webp"), HEADLINE_OWNED_FOLDERS, false);
checkOwned("pages/ ait degil", path("pages", "x.webp"), HEADLINE_OWNED_FOLDERS, false);
checkOwned("gallery/{albumId} ait degil", path("gallery/album-1", "x.webp"), HEADLINE_OWNED_FOLDERS, false);
checkOwned("sliders/ ait degil", path("sliders", "x.webp"), HEADLINE_OWNED_FOLDERS, false);
checkOwned("branding/ ait degil", path("branding", "logo.png"), HEADLINE_OWNED_FOLDERS, false);

// Prefix yanilmasi OLMAMALI — "headlines" ile "headlines-eski" ayri klasorler
checkOwned("headlines-eski prefix yanilmasi yok", path("headlines-eski", "x.webp"), HEADLINE_OWNED_FOLDERS, false);
checkOwned("headlinesX prefix yanilmasi yok", path("headlinesX", "x.webp"), HEADLINE_OWNED_FOLDERS, false);

// Fail-safe: tanimadigimiz sekiller silinmez
checkOwned("prefix'siz path (tenant yok) → false", "headlines/x.webp", HEADLINE_OWNED_FOLDERS, false);
checkOwned("tek segment → false", "x.webp", HEADLINE_OWNED_FOLDERS, false);
checkOwned("bos path → false", "", HEADLINE_OWNED_FOLDERS, false);
checkOwned("bos ownerFolders → false", HEADLINE_COVER, [], false);

// Baska modullerin kendi sahipligi de calisiyor (guard genellenebilir mi)
checkOwned("news modulu kendi dosyasina sahip", NEWS_COVER, ["news"], true);
checkOwned("news sahipligi news/gallery'yi kapsar", path("news/gallery", "x.webp"), ["news"], true);
checkOwned("cok sahipli liste", NEWS_COVER, ["headlines", "news"], true);

// ---------------------------------------------------------------------------
console.log("\n(b) removeFilesFromStorage — headlines SILINIR, news SILINMEZ\n");

{
  // Senaryo: kaynakli manset siliniyor. Gorsel HABERIN dosyasi.
  // ⬇ ASIL BUG: burada NEWS_COVER silinirse haberin kapagi gitmis demektir
  const fake = makeFakeClient();
  const res = await removeFilesFromStorage(fake, "images", [NEWS_COVER], HEADLINE_OWNED_FOLDERS);

  ok("remove", "haber kapagi SILINMEDI", fake.removedPaths, [], "kaynakli manset silme");
  ok("remove", ".remove() hic cagrilmadi", fake.removeCalls.length, 0, "kaynakli manset silme");
  ok("remove", "sonuc no-files", res, { removed: false, reason: "no-files" }, "kaynakli manset silme");
}
{
  // Senaryo: custom manset siliniyor. Gorsel MANSETIN kendi dosyasi.
  const fake = makeFakeClient();
  const res = await removeFilesFromStorage(fake, "images", [HEADLINE_COVER], HEADLINE_OWNED_FOLDERS);

  ok("remove", "mansetin kendi kapagi SILINDI", fake.removedPaths, [HEADLINE_COVER], "custom manset silme");
  ok("remove", "sonuc removed:true", res, { removed: true, count: 1 }, "custom manset silme");
  ok("remove", "dogru bucket", fake.removeCalls[0]?.bucket, "images", "custom manset silme");
}
{
  // Karisik liste: yalnizca sahip olunanlar gitmeli, digeri kalmali
  const fake = makeFakeClient();
  await removeFilesFromStorage(
    fake,
    "images",
    [NEWS_COVER, HEADLINE_COVER, HEADLINE_VIDEO],
    HEADLINE_OWNED_FOLDERS
  );

  ok(
    "remove",
    "karisik liste: sadece headlines/* silindi",
    fake.removedPaths,
    [HEADLINE_COVER, HEADLINE_VIDEO],
    "3 dosyali karisik liste"
  );
}
{
  // null'lar guard'dan once elenmeli (mevcut davranis korunuyor mu)
  const fake = makeFakeClient();
  await removeFilesFromStorage(fake, "images", [null, HEADLINE_COVER, null], HEADLINE_OWNED_FOLDERS);
  ok("remove", "null'lar elendi, gerisi silindi", fake.removedPaths, [HEADLINE_COVER], "[null, headlines, null]");
}

// ---------------------------------------------------------------------------
console.log("\n(c) cleanupReplacedFile — replace yolu da guard'li\n");

{
  // Senaryo: kaynakli mansette gorsel degistiriliyor (yeni gorsel yuklendi).
  // Eski deger HABERIN dosyasi -> silinmemeli.
  // ⬇ Bug'in 3. tetikleyicisi. Silme guard'lanip bu guard'lanmazsa yarim kapanir.
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(NEWS_COVER), url(HEADLINE_COVER), "images", HEADLINE_OWNED_FOLDERS);
  ok("replace", "yeni gorsel yukleme: haber kapagi korundu", fake.removedPaths, [], "news → headlines");
}
{
  // Senaryo: kaynak haber A'dan haber B'ye cevrildi -> A'nin kapagi silinmemeli
  const NEWS_B = path("news", "1757000000009-zzz.webp");
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(NEWS_COVER), url(NEWS_B), "images", HEADLINE_OWNED_FOLDERS);
  ok("replace", "kaynak degistirme: A'nin kapagi korundu", fake.removedPaths, [], "news A → news B");
}
{
  // Senaryo: ImageUploader'da X'e basildi -> onChange("") -> newUrl null
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(NEWS_COVER), null, "images", HEADLINE_OWNED_FOLDERS);
  ok("replace", "X ile temizleme: haber kapagi korundu", fake.removedPaths, [], "news → null");
}
{
  // Custom mansette gorsel degistirme: ESKI dosya mansetin kendisi -> silinmeli
  const NEW_HEADLINE = path("headlines", "1757000000010-yyy.webp");
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(HEADLINE_COVER), url(NEW_HEADLINE), "images", HEADLINE_OWNED_FOLDERS);
  ok("replace", "custom manset: eski kendi dosyasi silindi", fake.removedPaths, [HEADLINE_COVER], "headlines → headlines");
}
{
  // Video degistirme: headlines/videos da mansetin
  const NEW_VIDEO = path("headlines/videos", "1757000000011-www.mp4");
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(HEADLINE_VIDEO), url(NEW_VIDEO), "images", HEADLINE_OWNED_FOLDERS);
  ok("replace", "headlines/videos silindi", fake.removedPaths, [HEADLINE_VIDEO], "video replace");
}
{
  // Degisiklik yoksa hic dokunulmamali (mevcut davranis)
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(HEADLINE_COVER), url(HEADLINE_COVER), "images", HEADLINE_OWNED_FOLDERS);
  ok("replace", "ayni URL → no-op", fake.removeCalls.length, 0, "ayni URL");
}

// ---------------------------------------------------------------------------
console.log("\n(d) GERIYE UYUMLULUK — ownerFolders verilmezse eski davranis\n");

{
  const fake = makeFakeClient();
  await removeFilesFromStorage(fake, "images", [NEWS_COVER, HEADLINE_COVER]);
  ok(
    "compat",
    "guard'siz cagri: hepsi silinir",
    fake.removedPaths,
    [NEWS_COVER, HEADLINE_COVER],
    "ownerFolders yok"
  );
}
{
  const fake = makeFakeClient();
  await cleanupReplacedFile(fake, url(NEWS_COVER), url(HEADLINE_COVER));
  ok("compat", "guard'siz replace: eski silinir", fake.removedPaths, [NEWS_COVER], "ownerFolders yok");
}
{
  // Diger modullerin cagrilari (haberler, galeri, slider...) bozulmadi
  const fake = makeFakeClient();
  await removeFilesFromStorage(fake, "images", [path("gallery/album-1", "a.webp")]);
  ok(
    "compat",
    "galeri modulu etkilenmedi",
    fake.removedPaths,
    [path("gallery/album-1", "a.webp")],
    "galeri silme"
  );
}

// ---------------------------------------------------------------------------
console.log("\n(e) TAM PATH — tenant prefix'li gercek URL uzerinden\n");

{
  // storagePathFromUrl -> isOwnedPath zinciri gercek URL'de calisiyor mu.
  // 017 ile gelen {tenant_id}/ prefix'i guard'i sasirtmamali.
  const parsed = storagePathFromUrl(url(NEWS_COVER));
  ok("e2e", "URL → path parse", parsed, NEWS_COVER, url(NEWS_COVER));
  ok("e2e", "parse edilen path prefix'li", parsed?.split("/")[0], TENANT, url(NEWS_COVER));
  ok("e2e", "prefix'li path manset'e ait degil", isOwnedPath(parsed, HEADLINE_OWNED_FOLDERS), false, parsed);

  const parsedHeadline = storagePathFromUrl(url(HEADLINE_COVER));
  ok("e2e", "prefix'li headlines path'i ait", isOwnedPath(parsedHeadline, HEADLINE_OWNED_FOLDERS), true, parsedHeadline);

  // Query string'li URL (defansif parse) de dogru sonuclanmali
  const parsedQuery = storagePathFromUrl(`${url(HEADLINE_COVER)}?t=123`);
  ok("e2e", "query string'li URL", parsedQuery, HEADLINE_COVER, `${url(HEADLINE_COVER)}?t=123`);
  ok("e2e", "query string'li URL sahiplik", isOwnedPath(parsedQuery, HEADLINE_OWNED_FOLDERS), true, parsedQuery);
}
{
  // Baska tenant'in headlines dosyasi da "headlines" klasorunde — guard
  // tenant izolasyonu YAPMAZ, onu RLS yapar. Bu bilincli: guard'in isi
  // MODUL sahipligi, TENANT sahipligi degil.
  const otherTenantHeadline = buildStoragePath("ffffffff-0000-4000-8000-00000000ffff", "headlines", "x.webp");
  ok(
    "e2e",
    "guard tenant izolasyonu yapmaz (RLS'in isi)",
    isOwnedPath(otherTenantHeadline, HEADLINE_OWNED_FOLDERS),
    true,
    otherTenantHeadline
  );
}

// ---------------------------------------------------------------------------
console.log(`\nSONUC: ${passed} gecti, ${failures.length} kaldi\n`);
// process.exit() YERINE exitCode: Windows'ta cikti pipe'lanirken process.exit()
// bekleyen stdout yazmalarini yarida kesip libuv assertion'i tetikleyebiliyor
// (test yesil, exit 0, ama logda gurultu). Acik handle yok — Node dogal olarak
// bu kodla cikar.
process.exitCode = failures.length === 0 ? 0 : 1;
