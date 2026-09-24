/**
 * ZAMAN ASIMI MUHRU (C4, Supabase kesinti dayanikliligi Tur 2, 24 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:supabase-zaman-asimi
 *
 * KURAL: "her SUNUCU Supabase istemcisi zaman asimli fetch'ten gecer".
 * TypeScript AST ile (metin degil) + diske yazmadan oz-mutasyon.
 *
 *   R1 Fabrika cagrilari (`@supabase/supabase-js` createClient,
 *      `@supabase/ssr` createServerClient/createBrowserClient — yeniden
 *      adlandirilmis iceri almalar dahil) YALNIZ izinli dosyalarda.
 *   R2 Izinli her sunucu fabrikasinin secenek nesnesinde
 *      `global: { fetch: zamanAsimliFetch(<katman>) }` var; deger ciplak fetch
 *      DEGIL, zaman-asimli-fetch'ten iceri alinan fabrikanin CAGRISI; katman
 *      beklenenle ayni (admin.ts: parametre `katman`); `global`'den SONRA
 *      yayilim (...x) YOK (ezilemez).
 *   R3 Modul: butceler tek yerde (4/5/6/25 sn), AbortController + cagiranin
 *      sinyali elle baglanir (Edge'de AbortSignal.any YOK — olculdu),
 *      zaman asimi TimeoutError + isaret. Davranis birimi (C3 v2): 520–527
 *      ya da govdesi JSON olmayan 5xx → fetch reddedilir; JSON 5xx aynen.
 *   R4 Kapsam korlesmesin: sunucu fabrika cagrisi sayisi = taban.
 *   R5 Her createAdminClient cagrisi katmanini METIN SABITI ile verir.
 *
 * ISTISNALAR: tarayici istemcisi (lib/supabase/client.ts — tarayicinin kendi
 * agi; olay sunucu yolundaydi), scripts/**, lib/super-admin/setup-probe-deps
 * (Supabase istemcisi degil; kendi AbortSignal.timeout'u var — denetlenir),
 * next/image optimizer (Next'in kodu; Tur 3).
 *
 * AST muhru "baglandi mi"yi soyler; "gercekten kesiyor mu" = test:kesinti
 * (ariza enjektoru) + bu dosyadaki davranis birimleri.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const ts = createRequire(import.meta.url)("typescript");
const oku = (g) => readFileSync(path.join(REPO, g), "utf8");
const norm = (s) => s.replace(/\r\n/g, "\n");

const MODUL = "src/lib/supabase/zaman-asimli-fetch.ts";
const TARAYICI = "src/lib/supabase/client.ts";
/** Izinli sunucu fabrikalari ve beklenen katman ("@param" = fabrika parametresi `katman`). */
const IZINLI = {
  "src/lib/supabase/server.ts": ["admin-okuma"],
  "src/lib/supabase/admin.ts": ["@param"],
  "src/lib/supabase/public.ts": ["public-okuma"],
  "src/lib/supabase/auth-mail-client.ts": ["yazma"],
  "src/lib/tenant.ts": ["public-okuma"],
  "src/middleware.ts": ["middleware"],
};
const TABAN_FABRIKA = 6;
const KATMANLAR = new Set(["public-okuma", "admin-okuma", "yazma"]);

let gecti = 0;
const hatalar = [];
const iddia = (ad, kosul, ayrinti = "") => {
  if (kosul) { gecti++; console.log(`  PASS  ${ad}`); }
  else { hatalar.push(ad); console.log(`  FAIL  ${ad}${ayrinti ? `\n          ${ayrinti}` : ""}`); }
};

// ---------------------------------------------------------------------------
// Cozumleyici
// ---------------------------------------------------------------------------
const kaynak = (ad, metin) => ts.createSourceFile(ad, metin, ts.ScriptTarget.Latest, true, ad.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const gez = (d, f) => { f(d); ts.forEachChild(d, (c) => gez(c, f)); };

function fabrikaCagrilari(ad, metin) {
  const sf = kaynak(ad, metin);
  const yerel = new Map(); // yerel ad → kaynak ad
  let zamanFabrikasi = null;
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause?.namedBindings || !ts.isNamedImports(st.importClause.namedBindings)) continue;
    const mod = st.moduleSpecifier.text;
    for (const el of st.importClause.namedBindings.elements) {
      const asil = (el.propertyName ?? el.name).text;
      if ((mod === "@supabase/supabase-js" && asil === "createClient") || (mod === "@supabase/ssr" && (asil === "createServerClient" || asil === "createBrowserClient"))) yerel.set(el.name.text, asil);
      if (/zaman-asimli-fetch$/.test(mod) && asil === "zamanAsimliFetch") zamanFabrikasi = el.name.text;
    }
  }
  const out = [];
  gez(sf, (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && yerel.has(n.expression.text)) out.push({ n, asil: yerel.get(n.expression.text), sf });
  });
  return { out, zamanFabrikasi, sf };
}

/** R2: bir fabrika cagrisinin secenek nesnesini denetler. Donus: ihlal metni ya da null. */
function r2(cagri, zamanFabrikasi, beklenen) {
  const { n, sf } = cagri;
  const secenek = n.arguments[2];
  if (!secenek || !ts.isObjectLiteralExpression(secenek)) return "secenek nesnesi yok";
  const ozellikler = secenek.properties;
  const gi = ozellikler.findIndex((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "global");
  if (gi < 0) return "global yok";
  if (ozellikler.slice(gi + 1).some((p) => ts.isSpreadAssignment(p))) return "global'den SONRA yayilim var (ezilebilir)";
  const g = ozellikler[gi].initializer;
  if (!ts.isObjectLiteralExpression(g)) return "global nesne degil";
  const f = g.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(sf) === "fetch");
  if (!f) return "global.fetch yok";
  const v = f.initializer;
  if (!ts.isCallExpression(v) || !ts.isIdentifier(v.expression) || v.expression.text !== zamanFabrikasi || !zamanFabrikasi) return `global.fetch zaman asimli fabrikanin cagrisi DEGIL (${v.getText(sf)})`;
  const arg = v.arguments[0];
  if (beklenen === "@param") return arg && ts.isIdentifier(arg) && arg.text === "katman" ? null : `katman parametresi bekleniyordu (${arg?.getText(sf)})`;
  if (!arg || !ts.isStringLiteral(arg)) return "katman metin sabiti degil";
  return arg.text === beklenen ? null : `katman "${arg.text}" ≠ "${beklenen}"`;
}

function dosyalar() {
  const out = [];
  const gezD = (d) => {
    for (const a of readdirSync(path.join(REPO, d)).sort()) {
      const g = `${d}/${a}`;
      if (statSync(path.join(REPO, g)).isDirectory()) gezD(g);
      else if (/\.(ts|tsx)$/.test(a) && !a.endsWith(".d.ts")) out.push(g);
    }
  };
  gezD("src");
  return out;
}

/** Tum kapsam: R1 + R2 + R4 + R5. */
function tara(metinler) {
  const r1 = [], r2ihlal = [], r5 = [];
  let sunucuFabrika = 0, adminCagri = 0;
  for (const [g, m] of Object.entries(metinler)) {
    const { out, zamanFabrikasi, sf } = fabrikaCagrilari(g, m);
    for (const c of out) {
      if (g === TARAYICI && c.asil === "createBrowserClient") continue; // istisna
      if (!IZINLI[g]) { r1.push(`${g}: ${c.asil} (satir ${sf.getLineAndCharacterOfPosition(c.n.getStart(sf)).line + 1})`); continue; }
      sunucuFabrika++;
      const ih = r2(c, zamanFabrikasi, IZINLI[g][0]);
      if (ih) r2ihlal.push(`${g}: ${ih}`);
    }
    gez(sf, (n) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "createAdminClient") {
        adminCagri++;
        const a = n.arguments[0];
        if (!a || !ts.isStringLiteral(a) || !KATMANLAR.has(a.text)) r5.push(`${g}: createAdminClient(${a ? a.getText(sf) : ""})`);
      }
    });
  }
  return { r1, r2ihlal, r5, sunucuFabrika, adminCagri };
}

// ---------------------------------------------------------------------------
// (1) Gercek kaynak
// ---------------------------------------------------------------------------
const KAPSAM = dosyalar();
const GERCEK = Object.fromEntries(KAPSAM.map((g) => [g, norm(oku(g))]));
const s = tara(GERCEK);
console.log("\n--- (1) gercek kaynak");
iddia(`R1 izinli dosyalar disinda Supabase fabrika cagrisi yok (${KAPSAM.length} dosya tarandi)`, s.r1.length === 0, s.r1.join(" | "));
for (const [g, [bek]] of Object.entries(IZINLI)) {
  const { out, zamanFabrikasi } = fabrikaCagrilari(g, GERCEK[g] ?? "");
  const ih = out.map((c) => r2(c, zamanFabrikasi, bek)).filter(Boolean);
  iddia(`R2 ${g}: global.fetch = zamanAsimliFetch(${bek === "@param" ? "katman" : `"${bek}"`}), yayilimla ezilemez`, out.length > 0 && ih.length === 0, out.length ? ih.join(" | ") : "fabrika cagrisi bulunamadi");
}
iddia(`R4 sunucu fabrika cagrisi sayisi = ${TABAN_FABRIKA} (${s.sunucuFabrika})`, s.sunucuFabrika === TABAN_FABRIKA);
iddia(`R5 her createAdminClient katmanini metin sabitiyle veriyor (${s.adminCagri} cagri)`, s.r5.length === 0, s.r5.join(" | "));
iddia(`R5 kapsam korlesmesin: createAdminClient cagrisi >= 20 (${s.adminCagri})`, s.adminCagri >= 20);
/**
 * R3 — modul kurallari YORUMSUZ koda bakar (C4 v2, 25 Eylul 2026; kullanici
 * onayli kural duzeltmesi): v1 metni yorumlariyla tariyordu ve baslik
 * yorumundaki "AbortSignal.any YOK" ifadesine takildi. AbortSignal.any
 * erisimi AST ile aranir.
 */
function r3(metin) {
  const sf = kaynak(MODUL, metin);
  const kod = ts.createPrinter({ removeComments: true }).printFile(sf);
  let any = false;
  const butceler = {};
  let butceTanimi = 0;
  gez(sf, (n) => {
    if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "AbortSignal" && n.name.text === "any") any = true;
    // Butce nesnesi AST'ten okunur (printer 4_000'i 4000'e cevirir; metin kalibi kirilgan).
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.name.text === "SUPABASE_BUTCE_MS" && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      butceTanimi++;
      for (const p of n.initializer.properties) {
        if (ts.isPropertyAssignment(p) && ts.isNumericLiteral(p.initializer)) butceler[p.name.getText(sf).replace(/"/g, "")] = Number(p.initializer.text.replace(/_/g, ""));
      }
    }
  });
  return {
    butce: butceTanimi === 1 && JSON.stringify(butceler) === JSON.stringify({ middleware: 4000, "public-okuma": 5000, "admin-okuma": 6000, yazma: 25000 }),
    sinyal: kod.includes("new AbortController()") && kod.includes('cagiran.addEventListener("abort"') && !any,
    zamanAsimi: kod.includes('"TimeoutError"') && kod.includes("ZAMAN_ASIMI_ISARETI"),
  };
}
{
  const r = r3(GERCEK[MODUL] ?? "");
  iddia("R3 butceler tek yerde: middleware 4 / public 5 / admin 6 / yazma 25 sn", r.butce);
  iddia("R3 AbortController + cagiranin sinyali elle baglaniyor (AbortSignal.any YOK)", r.sinyal);
  iddia("R3 zaman asimi TimeoutError + isaret ile reddediliyor", r.zamanAsimi);
}
{
  const { out } = fabrikaCagrilari(TARAYICI, GERCEK[TARAYICI] ?? "");
  iddia("istisna: tarayici istemcisi yalniz client.ts'te createBrowserClient", out.length === 1 && out[0].asil === "createBrowserClient");
  const probe = GERCEK["src/lib/super-admin/setup-probe-deps.ts"] ?? "";
  iddia("istisna: setup-probe-deps ciplak fetch'i AbortSignal.timeout ile sinirli", probe.includes("AbortSignal.timeout("));
}

// ---------------------------------------------------------------------------
// (2) Davranis birimleri (gercek modul, yerel sunucu)
// ---------------------------------------------------------------------------
console.log("\n--- (2) davranis");
const mod = await import(new URL("../src/lib/supabase/zaman-asimli-fetch.ts", import.meta.url).href);
const askida = http.createServer(() => { /* hic cevap verme */ });
await new Promise((r) => askida.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${askida.address().port}/`;
{
  const t0 = Date.now();
  let hata = null;
  try { await mod.zamanAsimliFetch("middleware")(url); } catch (e) { hata = e; }
  const ms = Date.now() - t0;
  iddia(`middleware butcesi ~4 sn'de keser, TimeoutError + isaret (${ms} ms)`, !!hata && ms >= 3900 && ms < 5500 && hata.name === "TimeoutError" && mod.zamanAsimiMi(hata), String(hata));
}
{
  const c = new AbortController();
  const t0 = Date.now();
  setTimeout(() => c.abort(new Error("cagiran-iptal")), 100);
  let hata = null;
  try { await mod.zamanAsimliFetch("yazma")(url, { signal: c.signal }); } catch (e) { hata = e; }
  iddia(`cagiranin sinyali iletilir (100 ms'de iptal, ${Date.now() - t0} ms)`, !!hata && Date.now() - t0 < 2000 && !mod.zamanAsimiMi(hata), String(hata));
}
askida.close();
{
  // C3 v2 (25 Eylul 2026): 520–527 ya da govdesi JSON olmayan 5xx → fetch
  // reddedilir (auth-js yeniden denenebilir sayar, oturumu silmez); JSON 5xx aynen.
  const cevaplar = {
    "/cf522": [522, "text/html", "<!DOCTYPE html><html><head><title>x | 522: Connection timed out</title></head><body>cf</body></html>"],
    "/json503": [503, "application/json", '{"message":"sema onbellegi","code":"PGRST002"}'],
    "/duz502": [502, "text/plain", "Bad Gateway"],
  };
  const sahte = http.createServer((q, s) => { const [d, t, g] = cevaplar[q.url]; s.writeHead(d, { "content-type": t }); s.end(g); });
  await new Promise((r) => sahte.listen(0, "127.0.0.1", r));
  const kok = `http://127.0.0.1:${sahte.address().port}`;
  const dene = async (yol) => { try { return { yanit: await mod.zamanAsimliFetch("public-okuma")(kok + yol) }; } catch (e) { return { hata: e }; } };
  const a = await dene("/cf522");
  iddia("v2 522 + HTML → fetch reddedilir (SupabaseAgHatasi, isaret, HTML yok)",
    !!a.hata && a.hata.name === "SupabaseAgHatasi" && String(a.hata.message).includes(mod.AG_5XX_ISARETI) && !String(a.hata.message).includes("<") && !mod.zamanAsimiMi(a.hata), String(a.hata ?? a.yanit?.status));
  const b = await dene("/json503");
  const bGovde = b.yanit ? await b.yanit.text() : null;
  iddia("v2 503 + JSON govde → DONUSTURULMEZ (durum ve govde aynen)", b.yanit?.status === 503 && bGovde === cevaplar["/json503"][2], String(b.hata ?? bGovde));
  const c = await dene("/duz502");
  iddia("v2 502 + JSON olmayan govde → fetch reddedilir", !!c.hata && c.hata.name === "SupabaseAgHatasi", String(c.hata ?? c.yanit?.status));
  sahte.close();
}
iddia("zamanAsimiMi: PostgREST bicimi { message: 'TimeoutError: …isaret…' } → true",
  mod.zamanAsimiMi({ message: `TimeoutError: ${mod.ZAMAN_ASIMI_ISARETI}: yazma 25000 ms`, details: "" }));
iddia("zamanAsimiMi: baska hatalar → false", !mod.zamanAsimiMi({ message: "duplicate key", code: "23505" }) && !mod.zamanAsimiMi(null));
{
  const html = `<!DOCTYPE html><html><head><title>x | 522: Connection timed out</title></head><body>${"<div>cf</div>".repeat(500)}</body></html>`;
  const k = mod.kisaHata({ message: html, status: 522 });
  iddia(`kisaHata: HTML atilir, baslik korunur (${JSON.stringify(k)})`, !k.includes("<") && k.includes("[HTML govde atildi") && k.includes("522"));
  iddia("kisaHata: en cok 300 karakter", mod.kisaHata({ message: "x".repeat(1000) }).length <= 300);
  iddia("kisaHata: durum + ad + mesaj", mod.kisaHata({ name: "AuthApiError", status: 403, message: "yok" }) === "durum 403 · AuthApiError · yok");
}

// ---------------------------------------------------------------------------
// (3) Oz-sinama — bellekte mutasyon, beklenen kural dusmeli
// ---------------------------------------------------------------------------
console.log("\n--- (3) oz-sinama");
const MUT = [
  ["M1 server.ts global satiri silinir", "src/lib/supabase/server.ts", [['      global: { fetch: zamanAsimliFetch("admin-okuma") },\n', ""]], "R2"],
  ["M2 public.ts ciplak fetch", "src/lib/supabase/public.ts", [['zamanAsimliFetch("public-okuma")', "fetch"]], "R2"],
  ["M3 bir sayfaya dogrudan createClient", "src/app/(public)/haberler/page.tsx", [['import { createPublicClient } from "@/lib/supabase/public";\n', 'import { createPublicClient } from "@/lib/supabase/public";\nimport { createClient } from "@supabase/supabase-js";\nconst gizli = () => createClient("u", "k");\nvoid gizli;\n']], "R1"],
  ["M4 tenant.ts katman adi degisir", "src/lib/tenant.ts", [['zamanAsimliFetch("public-okuma")', 'zamanAsimliFetch("admin-okuma")']], "R2"],
  ["M5 server.ts global'den sonra yayilim", "src/lib/supabase/server.ts", [['      global: { fetch: zamanAsimliFetch("admin-okuma") },\n', '      global: { fetch: zamanAsimliFetch("admin-okuma") },\n      ...({} as object),\n']], "R2"],
];
for (const [ad, dosya, degisim, kural] of MUT) {
  let m = GERCEK[dosya] ?? "";
  let gecerli = !!m;
  for (const [a, b] of degisim) { if (m.split(a).length !== 2) { gecerli = false; break; } m = m.replace(a, b); }
  if (!gecerli) { iddia(`${ad}: mutasyon uygulanabilir (desen tam bir kez)`, false, dosya); continue; }
  const r = tara({ ...GERCEK, [dosya]: m });
  const dusen = kural === "R1" ? r.r1 : r.r2ihlal;
  iddia(`${ad} → ${kural} yakalandi`, dusen.length > 0, JSON.stringify(r));
}
{
  const a = 'cagiran.addEventListener("abort"';
  const m = (GERCEK[MODUL] ?? "").replace(/\s*if \(cagiran\) \{[\s\S]*?\n    \}\n/, "\n");
  iddia("M6 modulde cagiran sinyali baglanmaz → R3 yakalandi", (GERCEK[MODUL] ?? "").includes(a) && !r3(m).sinyal);
}
{
  // C4 v2 oz-sinama (kullanici karari): duzeltilen R3 korlesmesin.
  const bas = "    const denetci = new AbortController();\n";
  const g = GERCEK[MODUL] ?? "";
  const m7 = g.replace(bas, bas + "    void AbortSignal.any;\n");
  iddia("M7 modul koduna gercek AbortSignal.any erisimi → R3 YAKALAR", g.split(bas).length === 2 && !r3(m7).sinyal);
  const m8 = g.replace(bas, bas + "    // AbortSignal.any burada kullanilmiyor (yalniz yorum)\n");
  iddia("M8 ifade yalniz yorumda → R3 ihlal YOK", g.split(bas).length === 2 && Object.values(r3(m8)).every(Boolean));
}
{
  const r = tara(GERCEK);
  iddia("negatif kontrol: mutasyonsuz kaynak 0 ihlal", r.r1.length + r.r2ihlal.length + r.r5.length === 0);
}

console.log("");
console.log(`SONUC: ${gecti} gecti, ${hatalar.length} kaldi`);
process.exitCode = hatalar.length ? 1 : 0;
