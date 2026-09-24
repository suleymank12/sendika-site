/**
 * KURUM COZUMU MUHRU (T10) — kaynak tarayan test + oz-mutasyon (23 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:kurum-cozumu
 *   (= node scripts/test-kurum-cozumu.mjs)
 *
 * ## NEDEN VAR
 *
 * Olculdu (T10 korlesme mutasyonu, raporlar/2026-09-23-0116-…): Next 14
 * layout ile sayfayi PARALEL render ediyor. Layout'taki `notFound()` sayfanin
 * okudugu veriyi KORUMUYOR — sayfanin yonlendirme hedefi bilinmeyen host'un
 * notr 404'unun HTML ve RSC yukune sizdi. Kural:
 *
 *   KURUMA BAGLI VERI OKUYAN HER FONKSIYON KURUMU KENDISI COZER.
 *
 * Izolasyon matrisi bunu DAVRANISLA yakalar, ama yalniz matristeki yollarda.
 * Bu test ayni kurali KAYNAKTA, kapsamdaki HER dosyada zorlar — Next 15
 * gecisinde (headers/params async) neredeyse butun sayfalar degisecek; bu
 * muhur o toplu duzenlemenin sigortasi.
 *
 * ## KURALLAR (TypeScript AST, metin degil)
 *
 *   R1 Veri okuyan fonksiyon ya (a) ilk parametresi `tenantId` olan bir
 *      YARDIMCIDIR (cagiran cozer) ya da (b) ilk veri okumasindan ONCE
 *      (kaynak sirasinda) getCurrentTenant / resolveCurrentTenant /
 *      getCurrentTenantOrNull cagirir.
 *      "Veri okuma" = `.from("…")` / `.rpc(…)` ya da veri yardimcisi cagrisi
 *      (lib/public-queries.ts + lib/site-settings.ts disa aktarimlari +
 *      ayni dosyadaki `tenantId` parametreli yardimcilar — OTOMATIK toplanir).
 *      `buildPublicMetadata` kurumu kendi icinde cozer (lib/seo.ts, ayni
 *      kuralla taranir) — okuma sayilmaz.
 *   R2 Her `.from("…")` zinciri `.eq("tenant_id", <ifade>)` tasir; ifade
 *      metin sabiti OLAMAZ.
 *   R3 Kapsamdaki dosyalarda sabit kurum kimligi yok: default kurumun
 *      UUID'si ya da `"default"` metin sabiti.
 *   R4 Kapsam korlesmesin: (public) altindaki her page.tsx'in varsayilan
 *      disa aktarimi taranmis ve veri okuyor olmali; taban sayilar tutmali.
 *   R5 GECICI HATA ≠ YOK (Supabase kesinti dayanikliligi C2, 24 Eylul 2026):
 *      a) lib/get-tenant.ts getCurrentTenant "gecici-hata"yi FIRLATIR, bu dal
 *         notFound()'dan ONCE gelir ve notFound cagirmaz.
 *      b) resolveCurrentTenant'in catch'i { kind: "gecici-hata" } doner
 *         ("unknown-slug" ile birlesmez).
 *      c) Kapsamda getCurrentTenantOrNull YOK (gecici hatayi null'a cevirip
 *         kurumsuz render etmenin yolu).
 *      d) resolveCurrentTenant'i dogrudan kullanan her kapsam fonksiyonu
 *         "gecici-hata"yi ACIKCA ele alir; dal notFound cagirmaz, firlatir.
 *         TEK istisna kok layout generateMetadata: notr metadata DONER
 *         (admin rotalarini da sardigi icin firlatamaz; public'i
 *         (public)/layout + sayfalar firlatarak korur).
 *
 * ## OZ-SINAMA (mutasyon, DISKE YAZMADAN)
 *
 *   Gercek dosyalarin metni bellekte bozulur ve ayni cozumleyiciden
 *   gecirilir; her mutasyon BEKLENEN kurali dusurmeli. Negatif kontrol:
 *   bozulmamis dosyalar 0 ihlal. Cozumleyici bir gun korlesirse (TS surumu,
 *   yeni sozdizimi) mutasyonlar yakalanmaz ve test KIRMIZI olur.
 *
 * ## KAPSAM DISI (bilincli)
 *
 *   /admin/* ve /api/*: admin sayfalari kurumu layout + istemci baglamindan
 *   (TenantProvider) aliyor, sorgular RLS altinda; ayri degerlendirme
 *   NOTE.md "🔑 B2 kapanisi". /api/contact kurumu host'tan kendisi cozuyor.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const ts = createRequire(import.meta.url)("typescript");

const RESOLVERS = new Set(["getCurrentTenant", "resolveCurrentTenant", "getCurrentTenantOrNull"]);
const KENDI_COZEN = new Set(["buildPublicMetadata"]);
const YARDIMCI_DOSYALARI = ["src/lib/public-queries.ts", "src/lib/site-settings.ts"];
const EK_DOSYALAR = ["src/app/layout.tsx", "src/app/robots.txt/route.ts", "src/app/sitemap.xml/route.ts", "src/lib/seo.ts", ...YARDIMCI_DOSYALARI];
const DEFAULT_UUID = /^0{8}-0{4}-0{4}-0{4}-0{11}1$/;

// ---------------------------------------------------------------------------
// Cozumleyici
// ---------------------------------------------------------------------------
const kaynak = (ad, metin) => ts.createSourceFile(ad, metin, ts.ScriptTarget.Latest, true, ad.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

/** Ust duzey fonksiyonlar: function bildirimi, `const x = (async) () =>`, `const x = cache(async () =>)`. */
function ustFonksiyonlar(sf) {
  const out = [];
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.body) {
      const varsayilan = !!st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
      out.push({ ad: st.name?.text ?? "(adsiz)", fn: st, varsayilan });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        let ini = d.initializer;
        if (ini && ts.isCallExpression(ini) && ini.arguments[0] && (ts.isArrowFunction(ini.arguments[0]) || ts.isFunctionExpression(ini.arguments[0]))) ini = ini.arguments[0];
        if (ini && (ts.isArrowFunction(ini) || ts.isFunctionExpression(ini))) out.push({ ad: d.name.getText(sf), fn: ini, varsayilan: false });
      }
    }
  }
  return out;
}

const gez = (dugum, f) => { f(dugum); ts.forEachChild(dugum, (c) => gez(c, f)); };
const calleeAdi = (c) => (ts.isIdentifier(c.expression) ? c.expression.text : ts.isPropertyAccessExpression(c.expression) ? c.expression.name.text : null);

/** `.from(...)` cagrisinin ait oldugu zincirin en dis cagrisina kadar yukari cik. */
function zincir(fromCagri) {
  const cagrilar = [fromCagri];
  let d = fromCagri;
  while (d.parent && (ts.isPropertyAccessExpression(d.parent) || (ts.isCallExpression(d.parent) && d.parent.expression === d) || ts.isNonNullExpression(d.parent))) {
    d = d.parent;
    if (ts.isCallExpression(d)) cagrilar.push(d);
  }
  return cagrilar;
}

/**
 * Bir dosyayi cozumler. `veriYardimcilari`: disaridan bilinen veri yardimcisi
 * adlari. Donus: { ihlaller: [...], fonksiyonlar: [...] }.
 */
function cozumle(ad, metin, veriYardimcilari) {
  const sf = kaynak(ad, metin);
  const ihlaller = [];
  const fonksiyonlar = ustFonksiyonlar(sf);
  const yerel = new Set();
  const ilkParam = (fn) => fn.parameters[0]?.name.getText(sf) ?? null;
  const veriCagrilari = (fn, bilinen) => {
    const cag = [];
    gez(fn.body, (n) => {
      if (!ts.isCallExpression(n)) return;
      const a = calleeAdi(n);
      // Supabase: ilk arguman tablo/fonksiyon ADI (metin sabiti). `Array.from({…})` sayilmaz.
      if (ts.isPropertyAccessExpression(n.expression) && (a === "from" || a === "rpc") && n.arguments[0] && ts.isStringLiteral(n.arguments[0])) cag.push({ n, tur: a });
      else if (ts.isIdentifier(n.expression) && bilinen.has(a)) cag.push({ n, tur: `yardimci:${a}` });
    });
    return cag;
  };
  // 1. gecis: ayni dosyadaki tenantId parametreli veri yardimcilari
  for (const { ad: fad, fn } of fonksiyonlar) {
    if (ilkParam(fn) === "tenantId" && veriCagrilari(fn, veriYardimcilari).length) yerel.add(fad);
  }
  const bilinen = new Set([...veriYardimcilari, ...yerel]);
  const sonuc = [];
  for (const { ad: fad, fn, varsayilan } of fonksiyonlar) {
    const cag = veriCagrilari(fn, bilinen).filter((c) => !(c.tur.startsWith("yardimci:") && c.tur.slice(9) === fad));
    let cozum = null;
    gez(fn.body, (n) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && RESOLVERS.has(n.expression.text)) cozum = cozum ?? n.getStart(sf); });
    let kendiCozen = false;
    gez(fn.body, (n) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && KENDI_COZEN.has(n.expression.text)) kendiCozen = true; });
    const yardimci = ilkParam(fn) === "tenantId";
    sonuc.push({ ad: fad, varsayilan, veri: cag.length, cozum: cozum !== null, yardimci, kendiCozen });
    if (cag.length && !yardimci) {
      const ilk = Math.min(...cag.map((c) => c.n.getStart(sf)));
      if (cozum === null) ihlaller.push({ kural: "R1", yer: `${ad} :: ${fad}`, ayrinti: `kurum cozumu YOK, ilk veri okumasi satir ${sf.getLineAndCharacterOfPosition(ilk).line + 1}` });
      else if (cozum > ilk) ihlaller.push({ kural: "R1", yer: `${ad} :: ${fad}`, ayrinti: `kurum cozumu ilk veri okumasindan SONRA (satir ${sf.getLineAndCharacterOfPosition(cozum).line + 1} > ${sf.getLineAndCharacterOfPosition(ilk).line + 1})` });
    }
    // R2: her .from zinciri tenant_id filtresi
    for (const { n, tur } of cag) {
      if (tur !== "from") continue;
      const zin = zincir(n);
      const filtre = zin.find((c) => calleeAdi(c) === "eq" && c.arguments[0] && ts.isStringLiteral(c.arguments[0]) && c.arguments[0].text === "tenant_id");
      const satir = sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
      const tablo = n.arguments[0].getText(sf);
      if (!filtre) ihlaller.push({ kural: "R2", yer: `${ad} :: ${fad}`, ayrinti: `.from(${tablo}) satir ${satir}: .eq("tenant_id", …) YOK` });
      else if (filtre.arguments[1] && (ts.isStringLiteral(filtre.arguments[1]) || ts.isNoSubstitutionTemplateLiteral(filtre.arguments[1]))) ihlaller.push({ kural: "R2", yer: `${ad} :: ${fad}`, ayrinti: `.from(${tablo}) satir ${satir}: tenant_id SABIT metin` });
    }
  }
  // R3: sabit kurum kimligi
  gez(sf, (n) => {
    if (!(ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))) return;
    if (DEFAULT_UUID.test(n.text) || n.text === "default") {
      ihlaller.push({ kural: "R3", yer: ad, ayrinti: `sabit kurum kimligi "${n.text}" satir ${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}` });
    }
  });
  return { ihlaller, fonksiyonlar: sonuc };
}

// ---------------------------------------------------------------------------
// Kapsam
// ---------------------------------------------------------------------------
const oku = (g) => readFileSync(path.join(REPO, g), "utf8");
function dosyalar() {
  const out = [];
  const gezD = (d) => {
    for (const a of readdirSync(path.join(REPO, d)).sort()) {
      const g = `${d}/${a}`;
      if (statSync(path.join(REPO, g)).isDirectory()) gezD(g);
      else if (/\.(ts|tsx)$/.test(a)) out.push(g);
    }
  };
  gezD("src/app/(public)");
  return [...out, ...EK_DOSYALAR];
}
const VERI_YARDIMCILARI = new Set(YARDIMCI_DOSYALARI.flatMap((g) => ustFonksiyonlar(kaynak(g, oku(g))).map((x) => x.ad)));
const tara = (metinler) => {
  const r = {};
  for (const [g, m] of Object.entries(metinler)) r[g] = cozumle(g, m, VERI_YARDIMCILARI);
  return r;
};

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------
let gecti = 0;
const hatalar = [];
const iddia = (ad, kosul, ayrinti = "") => {
  if (kosul) { gecti++; console.log(`  PASS  ${ad}`); }
  else { hatalar.push(ad); console.log(`  FAIL  ${ad}${ayrinti ? `\n          ${ayrinti}` : ""}`); }
};

const KAPSAM = dosyalar();
const GERCEK = Object.fromEntries(KAPSAM.map((g) => [g, oku(g)]));
const sonuc = tara(GERCEK);

console.log("\n--- (1) gercek kaynak: kurallar");
for (const g of KAPSAM) {
  const ih = sonuc[g].ihlaller;
  iddia(`${g}: 0 ihlal`, ih.length === 0, ih.map((x) => `[${x.kural}] ${x.yer} — ${x.ayrinti}`).join("\n          "));
}

console.log("\n--- (2) kapsam korlesmesin (R4)");
const sayfalar = KAPSAM.filter((g) => g.endsWith("/page.tsx"));
for (const g of sayfalar) {
  const v = sonuc[g].fonksiyonlar.find((f) => f.varsayilan);
  iddia(`${g}: varsayilan disa aktarim taraniyor, veri okuyor ve kurumu cozuyor`, !!v && v.veri > 0 && v.cozum, JSON.stringify(v));
}
const tumF = Object.values(sonuc).flatMap((s) => s.fonksiyonlar);
const veriF = tumF.filter((f) => f.veri > 0);
iddia(`taranan dosya >= 25 (${KAPSAM.length})`, KAPSAM.length >= 25);
iddia(`sayfa dosyasi >= 17 (${sayfalar.length})`, sayfalar.length >= 17);
iddia(`veri okuyan fonksiyon >= 40 (${veriF.length})`, veriF.length >= 40);
iddia(`veri yardimcisi >= 9 (${VERI_YARDIMCILARI.size}: ${[...VERI_YARDIMCILARI].join(", ")})`, VERI_YARDIMCILARI.size >= 9);
iddia(`tenantId parametreli yardimci >= 11 (${veriF.filter((f) => f.yardimci).length})`, veriF.filter((f) => f.yardimci).length >= 11);

console.log("\n--- (2b) gecici hata ≠ yok (R5)");
const GT = "src/lib/get-tenant.ts";
const R5_DONEN_ISTISNA = new Set(["src/app/layout.tsx :: generateMetadata"]);
const cagriVar = (dugum, ad) => { let v = false; gez(dugum, (n) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === ad) v = true; }); return v; };
const throwVar = (dugum) => { let v = false; gez(dugum, (n) => { if (ts.isThrowStatement(n)) v = true; }); return v; };
const returnVar = (dugum) => { let v = false; gez(dugum, (n) => { if (ts.isReturnStatement(n)) v = true; }); return v; };
const geciciIf = (fn, sf) => { const o = []; gez(fn.body, (n) => { if (ts.isIfStatement(n) && n.expression.getText(sf).includes('"gecici-hata"')) o.push(n); }); return o; };
/** R5a + R5b: get-tenant.ts */
function r5GetTenant(metin) {
  const sf = kaynak(GT, metin);
  const ihl = [];
  const fns = Object.fromEntries(ustFonksiyonlar(sf).map((f) => [f.ad, f.fn]));
  const gct = fns.getCurrentTenant;
  if (!gct) ihl.push("R5a getCurrentTenant bulunamadi");
  else {
    const dal = geciciIf(gct, sf)[0];
    let ilkNotFound = null;
    gez(gct.body, (n) => { if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === "notFound") ilkNotFound = ilkNotFound ?? n.getStart(sf); });
    if (!dal) ihl.push("R5a getCurrentTenant'ta gecici-hata dali YOK");
    else if (!throwVar(dal.thenStatement) || cagriVar(dal.thenStatement, "notFound")) ihl.push("R5a gecici-hata dali firlatmiyor ya da notFound cagiriyor");
    else if (ilkNotFound !== null && dal.getStart(sf) > ilkNotFound) ihl.push("R5a gecici-hata dali notFound'dan SONRA");
  }
  const rct = fns.resolveCurrentTenant;
  let catchTamam = false;
  if (rct) gez(rct.body, (n) => {
    if (!ts.isCatchClause(n)) return;
    gez(n.block, (r) => { if (ts.isReturnStatement(r) && r.expression && /kind:\s*"gecici-hata"/.test(r.expression.getText(sf))) catchTamam = true; });
  });
  if (!catchTamam) ihl.push("R5b resolveCurrentTenant catch'i gecici-hata DONMUYOR");
  return ihl;
}
/** R5c + R5d: kapsam dosyalari */
function r5Kapsam(metinler) {
  const ihl = [];
  let dogrudan = 0;
  for (const [g, m] of Object.entries(metinler)) {
    const sf = kaynak(g, m);
    if (cagriVar(sf, "getCurrentTenantOrNull")) ihl.push(`R5c ${g}: getCurrentTenantOrNull kullaniliyor`);
    for (const { ad: fad, fn } of ustFonksiyonlar(sf)) {
      if (!cagriVar(fn.body, "resolveCurrentTenant")) continue;
      dogrudan++;
      const yer = `${g} :: ${fad}`;
      const dallar = geciciIf(fn, sf);
      if (!dallar.length) { ihl.push(`R5d ${yer}: gecici-hata ACIKCA ele alinmiyor`); continue; }
      for (const d of dallar) {
        if (cagriVar(d.thenStatement, "notFound")) ihl.push(`R5d ${yer}: gecici-hata dali notFound cagiriyor`);
        else if (!throwVar(d.thenStatement) && !(R5_DONEN_ISTISNA.has(yer) && returnVar(d.thenStatement))) ihl.push(`R5d ${yer}: gecici-hata dali firlatmiyor`);
      }
    }
  }
  return { ihl, dogrudan };
}
{
  const a = r5GetTenant(oku(GT));
  iddia("R5a/b get-tenant: getCurrentTenant gecici-hata → firlat (notFound'dan once); catch → gecici-hata", a.length === 0, a.join(" | "));
  const k = r5Kapsam(GERCEK);
  const c = k.ihl.filter((x) => x.startsWith("R5c")), d = k.ihl.filter((x) => x.startsWith("R5d"));
  iddia("R5c kapsamda getCurrentTenantOrNull yok", c.length === 0, c.join(" | "));
  iddia(`R5d resolveCurrentTenant kullanan kapsam fonksiyonlari gecici-hata'yi acikca ele aliyor (${k.dogrudan})`, d.length === 0, d.join(" | "));
  iddia(`R5 kapsam korlesmesin: dogrudan resolveCurrentTenant kullanan >= 1 (${k.dogrudan})`, k.dogrudan >= 1);
}

console.log("\n--- (3) oz-sinama: bellekte mutasyon → beklenen kural dusmeli");
/**
 * Her mutasyon: [ad, dosya, [[aranan, yerine], ...], beklenen kural, beklenen yer parcasi].
 * Aranan metin dosyada TAM BIR KEZ bulunmali (bulunmazsa mutasyon gecersiz → FAIL,
 * sessizce atlanmaz). Satir sonu (CRLF) normalize edilir.
 */
const MUTASYONLAR = [
  ["M1 T10'un aynisi: eski adres rotasi kurum cozumunu atlar, sabit kurum id'si",
    "src/app/(public)/kurumsal/[slug]/page.tsx",
    [["const tenant = await getCurrentTenant();", "const tenant = { id: \"00000000-0000-0000-0000-000000000001\" };"]],
    ["R1", "R3"], "EskiKurumsalAdres"],
  ["M2 liste sayfasinda tenant_id filtresi silinir",
    "src/app/(public)/haberler/page.tsx",
    [[".eq(\"tenant_id\", tenant.id)", ""]], ["R2"], "NewsListPage"],
  ["M3 kurum cozumu ilk sorgudan SONRAYA tasinir",
    "src/app/(public)/galeri/page.tsx",
    [["  const tenant = await getCurrentTenant();\n", ""], ["  return (", "  const tenant = await getCurrentTenant();\n  return ("]],
    ["R1"], "GalleryPage"],
  ["M4 veri yardimcisinda tenant_id filtresi silinir",
    "src/lib/public-queries.ts",
    [[".eq(\"tenant_id\", tenantId)\n      .eq(\"slug\", slug)\n      .eq(\"is_published\", true)\n      .maybeSingle();\n    return (data as News)", ".eq(\"slug\", slug)\n      .eq(\"is_published\", true)\n      .maybeSingle();\n    return (data as News)"]],
    ["R2"], "getNewsBySlug"],
  ["M5 metadata kurumu cozmeden yardimci cagirir",
    "src/app/(public)/sayfa/[slug]/page.tsx",
    [["  const tenant = await getCurrentTenant();\n  // cache()'li ortak okuyucu", "  const tenant = { id: \"x\" } as { id: string };\n  // cache()'li ortak okuyucu"]],
    ["R1"], "generateMetadata"],
  ["M6 layout menusu kurumu cozmeden okunur (layout'a guven)",
    "src/app/(public)/layout.tsx",
    [["  const tenant = await getCurrentTenant();\n", "  const tenant = { id: \"x\", is_active: true, logo_url: null, name: \"\" };\n"]],
    ["R1"], "PublicLayout"],
  ["M7 filtre sabit metinle",
    "src/app/(public)/subeler/page.tsx",
    [[".eq(\"tenant_id\", tenant.id)", ".eq(\"tenant_id\", \"default\")"]], ["R2", "R3"], "BranchesPage"],
];
const norm = (s) => s.replace(/\r\n/g, "\n");
for (const [ad, dosya, degisim, bekKurallar, bekYer] of MUTASYONLAR) {
  let m = norm(GERCEK[dosya] ?? "");
  let gecerli = !!GERCEK[dosya];
  for (const [a, b] of degisim) {
    if (m.split(a).length !== 2) { gecerli = false; break; }
    m = m.replace(a, b);
  }
  if (!gecerli) { iddia(`${ad}: mutasyon uygulanabilir (desen dosyada tam bir kez)`, false, dosya); continue; }
  const r = cozumle(dosya, m, VERI_YARDIMCILARI);
  const gorulen = new Set(r.ihlaller.filter((x) => x.yer.includes(bekYer) || x.kural === "R3").map((x) => x.kural));
  const eksik = bekKurallar.filter((k) => !gorulen.has(k));
  iddia(`${ad} → ${bekKurallar.join("+")} yakalandi`, eksik.length === 0, `gorulen: ${r.ihlaller.map((x) => `[${x.kural}] ${x.yer} ${x.ayrinti}`).join(" | ") || "(ihlal yok)"}`);
}
// M8: kapsama yeni eklenen, kurumu hic cozmeyen bir sayfa
{
  const yeni = "import { createAdminClient } from \"@/lib/supabase/admin\";\nexport default async function Yeni() {\n  const { data } = await createAdminClient().from(\"news\").select(\"*\");\n  return <div>{data?.length}</div>;\n}\n";
  const r = cozumle("src/app/(public)/yeni/page.tsx", yeni, VERI_YARDIMCILARI);
  const k = new Set(r.ihlaller.map((x) => x.kural));
  iddia("M8 yeni sayfa kurum cozmeden + filtresiz okur → R1+R2 yakalandi", k.has("R1") && k.has("R2"), JSON.stringify(r.ihlaller));
}
// R5 oz-sinama (C2): gecici hatayi "yok"a ceviren her bicim yakalanmali
{
  const R5_MUT = [
    ["M9 getCurrentTenant gecici-hata → notFound", GT, [['if (cozum.kind === "gecici-hata") throw new KurumGeciciHatasi();', 'if (cozum.kind === "gecici-hata") notFound();']], "R5a"],
    ["M10 getCurrentTenant gecici-hata dali silinir", GT, [['  if (cozum.kind === "gecici-hata") throw new KurumGeciciHatasi();\n', ""]], "R5a"],
    ["M11 catch unknown-slug'a birlesir", GT, [['return { kind: "gecici-hata" };', 'return { kind: "unknown-slug" };']], "R5b"],
    ["M12 kok metadata gecici-hata dali silinir (Sayfa Bulunamadı'ya duser)", "src/app/layout.tsx", [['  if (cozum.kind === "gecici-hata") {\n    return { title: "Geçici sorun", robots: { index: false, follow: false } };\n  }\n', ""]], "R5d"],
    ["M13 public layout getCurrentTenantOrNull ile kurumsuz render", "src/app/(public)/layout.tsx", [["  const tenant = await getCurrentTenant();\n", "  const tenant = (await getCurrentTenantOrNull())!;\n"]], "R5c"],
  ];
  for (const [ad, dosya, degisim, kural] of R5_MUT) {
    let m = norm(dosya === GT ? oku(GT) : GERCEK[dosya] ?? "");
    let gecerli = !!m;
    for (const [a, b] of degisim) { if (m.split(a).length !== 2) { gecerli = false; break; } m = m.replace(a, b); }
    if (!gecerli) { iddia(`${ad}: mutasyon uygulanabilir (desen dosyada tam bir kez)`, false, dosya); continue; }
    const ihl = dosya === GT ? r5GetTenant(m) : r5Kapsam({ ...GERCEK, [dosya]: m }).ihl;
    iddia(`${ad} → ${kural} yakalandi`, ihl.some((x) => x.startsWith(kural)), ihl.join(" | ") || "(ihlal yok)");
  }
}
// Negatif kontrol: norm edilmis gercek metinler 0 ihlal (CRLF farki sahte ihlal uretmesin)
{
  const r = tara(Object.fromEntries(Object.entries(GERCEK).map(([g, m]) => [g, norm(m)])));
  const n = Object.values(r).reduce((a, s) => a + s.ihlaller.length, 0);
  iddia("negatif kontrol: mutasyonsuz (LF normalize) kaynak 0 ihlal", n === 0, `${n} ihlal`);
}

console.log("");
console.log(`SONUC: ${gecti} gecti, ${hatalar.length} kaldi`);
process.exitCode = hatalar.length ? 1 : 0;
