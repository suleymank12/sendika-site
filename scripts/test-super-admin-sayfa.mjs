/**
 * SUPER ADMIN SAYFA MUHRU (Guvenlik G1 / S1, 25 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:super-admin-sayfa
 *
 * KURAL: "super admin SUNUCU sayfasi veri okumadan once yetki kapisindan gecer".
 * Next 14 layout ile sayfayi PARALEL render eder; layout'taki kapi sayfayi
 * korumaz (T10 dersi). Olculen sizinti: yetkisiz/gecici ekranda pano ciktisi
 * RSC yukundeydi (raporlar/2026-09-25-0126-…, S1). Davranis tarafi:
 * test:kesinti s1 (tenants istegi 0, isaret yok).
 *
 * TypeScript AST ile, `src/app/super-admin/(authenticated)/**\/page.tsx`:
 *   K1 sunucu sayfasinin (default export) 1. ifadesi
 *      `const X = await superAdminKarari()` (lib/super-admin/super-admin-karari'dan)
 *   K2 2. ifadesi `if (X.kind !== "izin") return …` (baska bicim ihlal)
 *   K3 istemci sayfalari ("use client") sunucu/service istemcisi ice aktarmaz
 *      (@/lib/supabase/server, @/lib/supabase/admin)
 *   K4 taban: sunucu sayfasi 1, istemci sayfasi 4 (yeni sayfa → tahmine yazilir)
 * Oz-sinama: diske yazmadan bellekte mutasyon (M1–M6) + negatif kontrol.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const ts = createRequire(import.meta.url)("typescript");
const KOK = "src/app/super-admin/(authenticated)";
const KAPI_MODULU = "@/lib/super-admin/super-admin-karari";
const TABAN = { sunucu: 1, istemci: 4 };
const YASAK_ISTEMCI = ["@/lib/supabase/server", "@/lib/supabase/admin"];

let gecti = 0;
const hatalar = [];
const iddia = (ad, kosul, ayrinti = "") => {
  if (kosul) { gecti++; console.log(`  PASS  ${ad}`); }
  else { hatalar.push(ad); console.log(`  FAIL  ${ad}${ayrinti ? `\n          ${ayrinti}` : ""}`); }
};

function sayfalar() {
  const out = [];
  const gez = (d) => {
    for (const a of readdirSync(path.join(REPO, d)).sort()) {
      const g = `${d}/${a}`;
      if (statSync(path.join(REPO, g)).isDirectory()) gez(g);
      else if (a === "page.tsx") out.push(g);
    }
  };
  gez(KOK);
  return out;
}

const kaynak = (ad, metin) => ts.createSourceFile(ad, metin, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const istemciMi = (sf) => {
  const ilk = sf.statements[0];
  return !!ilk && ts.isExpressionStatement(ilk) && ts.isStringLiteral(ilk.expression) && ilk.expression.text === "use client";
};

/** Default export edilen fonksiyonun govdesi (function bildirimi ya da `export default Ad`). */
function varsayilanGovde(sf) {
  let ad = null;
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) return st.body ?? null;
    if (ts.isExportAssignment(st) && ts.isIdentifier(st.expression)) ad = st.expression.text;
  }
  if (!ad) return null;
  for (const st of sf.statements) if (ts.isFunctionDeclaration(st) && st.name?.text === ad) return st.body ?? null;
  return null;
}

/** Tek sunucu sayfasi: { k1, k2 } ihlal metni ya da null. */
function sunucuSayfasi(sf) {
  const kapiIceAktarildi = sf.statements.some((st) => ts.isImportDeclaration(st) && st.moduleSpecifier.text === KAPI_MODULU &&
    st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) &&
    st.importClause.namedBindings.elements.some((e) => !e.propertyName && e.name.text === "superAdminKarari"));
  const govde = varsayilanGovde(sf);
  if (!govde) return { k1: "default export fonksiyonu bulunamadi", k2: "—" };
  const [ilk, ikinci] = govde.statements;
  let degisken = null;
  if (ilk && ts.isVariableStatement(ilk) && ilk.declarationList.declarations.length === 1) {
    const d = ilk.declarationList.declarations[0];
    const i = d.initializer;
    if (ts.isIdentifier(d.name) && i && ts.isAwaitExpression(i) && ts.isCallExpression(i.expression) &&
        ts.isIdentifier(i.expression.expression) && i.expression.expression.text === "superAdminKarari" && i.expression.arguments.length === 0) {
      degisken = d.name.text;
    }
  }
  const k1 = !kapiIceAktarildi ? `superAdminKarari ${KAPI_MODULU}'dan ice aktarilmamis` : !degisken ? `1. ifade kapi degil: ${ilk ? ilk.getText(sf).slice(0, 80) : "(bos)"}` : null;
  let k2 = null;
  const e = ikinci && ts.isIfStatement(ikinci) ? ikinci.expression : null;
  const kosulDogru = !!e && ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken &&
    ts.isPropertyAccessExpression(e.left) && ts.isIdentifier(e.left.expression) && e.left.expression.text === degisken && e.left.name.text === "kind" &&
    ts.isStringLiteral(e.right) && e.right.text === "izin";
  const donus = !!e && !ikinci.elseStatement && (ts.isReturnStatement(ikinci.thenStatement) ||
    (ts.isBlock(ikinci.thenStatement) && ikinci.thenStatement.statements.length === 1 && ts.isReturnStatement(ikinci.thenStatement.statements[0])));
  if (!degisken || !kosulDogru || !donus) k2 = `2. ifade 'if (${degisken ?? "X"}.kind !== "izin") return' degil: ${ikinci ? ikinci.getText(sf).slice(0, 80) : "(bos)"}`;
  return { k1, k2 };
}

/** Tum kapsam. metinler: { dosya: metin } */
function tara(metinler) {
  const k1 = [], k2 = [], k3 = [];
  let sunucu = 0, istemci = 0;
  for (const [g, m] of Object.entries(metinler)) {
    const sf = kaynak(g, m);
    if (istemciMi(sf)) {
      istemci++;
      for (const st of sf.statements) {
        if (ts.isImportDeclaration(st) && YASAK_ISTEMCI.some((y) => st.moduleSpecifier.text === y || st.moduleSpecifier.text.endsWith(y.replace("@/lib", "lib")))) {
          k3.push(`${g}: ${st.moduleSpecifier.text}`);
        }
      }
      continue;
    }
    sunucu++;
    const r = sunucuSayfasi(sf);
    if (r.k1) k1.push(`${g}: ${r.k1}`);
    if (r.k2) k2.push(`${g}: ${r.k2}`);
  }
  const k4 = sunucu === TABAN.sunucu && istemci === TABAN.istemci;
  return { k1, k2, k3, k4, sunucu, istemci };
}

const DOSYALAR = sayfalar();
const GERCEK = Object.fromEntries(DOSYALAR.map((g) => [g, readFileSync(path.join(REPO, g), "utf8").replace(/\r\n/g, "\n")]));
const r = tara(GERCEK);

console.log(`\n--- (1) gercek kaynak (${DOSYALAR.length} sayfa)`);
iddia(`K1 her sunucu sayfasinin 1. ifadesi 'await superAdminKarari()' (${r.sunucu} sunucu sayfasi)`, r.sunucu > 0 && r.k1.length === 0, r.k1.join(" | "));
iddia(`K2 her sunucu sayfasinin 2. ifadesi 'if (X.kind !== "izin") return'`, r.sunucu > 0 && r.k2.length === 0, r.k2.join(" | "));
iddia(`K3 istemci sayfalari sunucu/service istemcisi ice aktarmaz (${r.istemci} istemci sayfasi)`, r.istemci > 0 && r.k3.length === 0, r.k3.join(" | "));
iddia(`K4 taban: sunucu ${TABAN.sunucu} / istemci ${TABAN.istemci} (gorulen ${r.sunucu} / ${r.istemci})`, r.k4);

console.log("\n--- (2) oz-sinama (bellekte)");
const PANO = `${KOK}/page.tsx`;
const KAPI = '  const karar = await superAdminKarari();\n';
const KOSUL = '  if (karar.kind !== "izin") return null;\n';
const ISTEMCI = '  const supabase = createClient();\n';
function mutasyon(ad, dosya, donustur, kural, beklenen) {
  const once = GERCEK[dosya];
  const sonra = once === undefined ? donustur("") : donustur(once);
  const uygulandi = sonra !== once && sonra !== null;
  if (!uygulandi) { iddia(`${ad}: mutasyon uygulanabilir`, false, dosya); return; }
  const m = tara({ ...GERCEK, [dosya]: sonra });
  iddia(`${ad} → ${kural} yakalandi`, beklenen(m), JSON.stringify({ k1: m.k1, k2: m.k2, k3: m.k3, k4: m.k4 }));
}
const tekDegis = (a, b) => (m) => (m.split(a).length === 2 ? m.replace(a, b) : null);
mutasyon("M1 kapi cagrisi silinir", PANO, tekDegis(KAPI, ""), "K1", (m) => m.k1.length > 0);
mutasyon("M2 kapi createClient'tan sonraya tasinir", PANO, (m) => (m.includes(KAPI + KOSUL) && m.split(ISTEMCI).length === 2 ? m.replace(KAPI + KOSUL, "").replace(ISTEMCI, ISTEMCI + KAPI + KOSUL) : null), "K1", (m) => m.k1.length > 0);
mutasyon("M3 if silinir (kapi cagrilir, sonucu kullanilmaz)", PANO, tekDegis(KOSUL, ""), "K2", (m) => m.k2.length > 0);
mutasyon("M4 kosul ters (=== \"izin\")", PANO, tekDegis('karar.kind !== "izin"', 'karar.kind === "izin"'), "K2", (m) => m.k2.length > 0);
mutasyon("M5 kapisiz yeni sunucu sayfasi", `${KOK}/yeni-rapor/page.tsx`,
  () => 'import { createClient } from "@/lib/supabase/server";\nexport default async function Rapor() {\n  const { data } = await createClient().from("tenants").select("id");\n  return <pre>{JSON.stringify(data)}</pre>;\n}\n',
  "K1+K4", (m) => m.k1.length > 0 && !m.k4);
mutasyon("M6 istemci sayfasina createAdminClient ice aktarilir", `${KOK}/tenants/page.tsx`,
  (m) => { const a = '"use client";\n'; return m.startsWith(a) ? a + 'import { createAdminClient } from "@/lib/supabase/admin";\n' + m.slice(a.length) : null; },
  "K3", (m) => m.k3.length > 0);
{
  const n = tara(GERCEK);
  iddia("negatif kontrol: mutasyonsuz kaynak 0 ihlal", n.k1.length + n.k2.length + n.k3.length === 0 && n.k4);
}

console.log("");
console.log(`SONUC: ${gecti} gecti, ${hatalar.length} kaldi`);
process.exitCode = hatalar.length ? 1 : 0;
