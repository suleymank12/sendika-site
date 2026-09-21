/**
 * LINT GUVENLIK KURALLARI — mutasyon testi (Faz 2, 21 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:lint-kurallari
 *   (= node scripts/test-lint-kurallari.mjs)
 *
 * ## NEDEN VAR
 *
 * `.eslintrc.json` iki GUVENLIK kurali tasiyor:
 *   - `react/no-danger`          → XSS korumasi: ham HTML yalniz SafeHtml'den
 *   - `no-restricted-imports`    → 500 korumasi: next/image yalniz SafeImage'dan
 *     (next/image tanimadigi src ile render'da firlatir, sayfa 500'e duser)
 *
 * Next 16'da `next lint` kalkiyor ve eslint 9 flat config'e gecilecek (Faz 4).
 * Gocte bu kurallar SESSIZCE dusebilir: lint "temiz" der, koruma gitmistir.
 * `npm run lint` bunu yakalayamaz — kurali ihlal eden kod zaten yok.
 * Bu test ihlali KENDISI uretir ve lint'in KIRILDIGINI dogrular.
 *
 * ## NASIL
 *
 * Gecici dosyalar yazar, ESLint CLI'yi JSON ciktiyla calistirir, dosyalari
 * HER DURUMDA (finally) siler. CLI + JSON bilincli: ayni cagri eslint 8
 * (.eslintrc) ve eslint 9 (flat config) ile degismeden calisir.
 *
 *   src/components/__lint_sinama_tehlike__.tsx  dangerouslySetInnerHTML
 *   src/components/__lint_sinama_gorsel__.tsx   import Image from "next/image"
 *   src/app/__lint_sinama_uygulama__.tsx        ikisi birden, baska dizinde
 *
 * Ilk ikisi BILEREK src/components/ altinda: istisnalar (SafeHtml/SafeImage)
 * bir gun "src/components/*" gibi genisletilirse bu dosyalar da muaf olur
 * ve test kirilir.
 *
 * Ters yon de sinanir: SafeHtml.tsx ve SafeImage.tsx bu yapilari GERCEKTEN
 * iceriyor ve lint onlari kabul ediyor (istisna calisiyor).
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const REPO = fileURLToPath(new URL("../", import.meta.url));
const ESLINT = path.join(REPO, "node_modules", "eslint", "bin", "eslint.js");

let passed = 0;
const failures = [];
function okTrue(group, name, cond, input = "") {
  if (cond === true) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}${input ? `\n          ${input}` : ""}`);
  }
}

const GECICI = {
  tehlike: "src/components/__lint_sinama_tehlike__.tsx",
  gorsel: "src/components/__lint_sinama_gorsel__.tsx",
  uygulama: "src/app/__lint_sinama_uygulama__.tsx",
  parola: "src/app/__lint_sinama_parola__.tsx",
};
const ICERIK = {
  tehlike: `export default function LintSinamaTehlike({ h }: { h: string }) {\n  return <div dangerouslySetInnerHTML={{ __html: h }} />;\n}\n`,
  gorsel: `import Image from "next/image";\n\nexport default function LintSinamaGorsel() {\n  return <Image src="/a.png" alt="a" width={1} height={1} />;\n}\n`,
  uygulama: `import Image from "next/image";\n\nexport default function LintSinamaUygulama({ h }: { h: string }) {\n  return (\n    <>\n      <Image src="/a.png" alt="a" width={1} height={1} />\n      <div dangerouslySetInnerHTML={{ __html: h }} />\n    </>\n  );\n}\n`,
  // 3 ihlal (duz input, Input bileseni, dinamik type) + 1 dogru kullanim
  parola: `import Input from "@/components/ui/Input";\n\nexport default function LintSinamaParola({ g }: { g: boolean }) {\n  return (\n    <form>\n      <input type="password" />\n      <Input id="p" type="password" />\n      <input type={g ? "text" : "password"} />\n      <input type="password" autoComplete="current-password" />\n    </form>\n  );\n}\n`,
};
const MESRU = { safeHtml: "src/components/SafeHtml.tsx", safeImage: "src/components/SafeImage.tsx" };
// Parola alani tasiyan GERCEK formlar (21 Eylul 2026) — kural onlarda hata vermemeli
// ve dogru autocomplete degerini tasimalilar.
const PAROLA_FORMLARI = {
  "src/app/admin/giris/AdminLoginForm.tsx": ["current-password"],
  "src/app/super-admin/giris/SuperAdminLoginForm.tsx": ["current-password"],
  "src/app/admin/davet-kabul/page.tsx": ["new-password", "new-password"],
};

let sonuclar = null;
try {
  for (const [ad, yol] of Object.entries(GECICI)) writeFileSync(path.join(REPO, yol), ICERIK[ad]);
  const r = spawnSync(process.execPath, [ESLINT, "--format", "json", ...Object.values(GECICI), ...Object.values(MESRU), ...Object.keys(PAROLA_FORMLARI)], {
    cwd: REPO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  try {
    sonuclar = JSON.parse(r.stdout);
  } catch {
    console.log(r.stdout, r.stderr);
  }
} finally {
  for (const yol of Object.values(GECICI)) rmSync(path.join(REPO, yol), { force: true });
}

console.log("\n--- (a) ESLint calisti");
okTrue("ortam", "ESLint JSON ciktisi okundu", Array.isArray(sonuclar), "eslint ciktisi JSON degil");
okTrue("ortam", "gecici dosyalarin HEPSI silindi", Object.values(GECICI).every((y) => !existsSync(path.join(REPO, y))), "");

if (Array.isArray(sonuclar)) {
  const mesajlar = (yol) => {
    const r = sonuclar.find((x) => path.relative(REPO, x.filePath).split(path.sep).join("/") === yol);
    return r ? r.messages : null;
  };
  const kural = (yol, id) => (mesajlar(yol) || []).filter((m) => m.ruleId === id && m.severity === 2);
  const ozet = (yol) => JSON.stringify((mesajlar(yol) || []).map((m) => `${m.ruleId}:${m.severity}`));

  console.log("\n--- (b) ihlaller lint'i KIRIYOR");
  okTrue("xss", "🔴 SafeHtml disinda dangerouslySetInnerHTML → react/no-danger HATA", kural(GECICI.tehlike, "react/no-danger").length === 1, ozet(GECICI.tehlike));
  const gorselHata = kural(GECICI.gorsel, "no-restricted-imports");
  okTrue("500", "🔴 SafeImage disinda next/image → no-restricted-imports HATA", gorselHata.length === 1, ozet(GECICI.gorsel));
  okTrue("500", "hata mesaji SafeImage'a yonlendiriyor", gorselHata.length === 1 && gorselHata[0].message.includes("SafeImage"), gorselHata[0]?.message || "");
  okTrue("xss", "baska dizinde de (src/app) react/no-danger HATA", kural(GECICI.uygulama, "react/no-danger").length === 1, ozet(GECICI.uygulama));
  okTrue("500", "baska dizinde de (src/app) next/image HATA", kural(GECICI.uygulama, "no-restricted-imports").length === 1, ozet(GECICI.uygulama));

  console.log("\n--- (c) mesru kullanicilar muaf (istisna calisiyor)");
  const safeHtmlKaynak = readFileSync(path.join(REPO, MESRU.safeHtml), "utf8");
  const safeImageKaynak = readFileSync(path.join(REPO, MESRU.safeImage), "utf8");
  okTrue("istisna", "SafeHtml gercekten dangerouslySetInnerHTML kullaniyor", safeHtmlKaynak.includes("dangerouslySetInnerHTML"), MESRU.safeHtml);
  okTrue("istisna", "SafeHtml'de react/no-danger hatasi YOK", mesajlar(MESRU.safeHtml) !== null && kural(MESRU.safeHtml, "react/no-danger").length === 0, ozet(MESRU.safeHtml));
  okTrue("istisna", "SafeImage gercekten next/image import ediyor", /from ["']next\/image["']/.test(safeImageKaynak), MESRU.safeImage);
  okTrue("istisna", "SafeImage'da no-restricted-imports hatasi YOK", mesajlar(MESRU.safeImage) !== null && kural(MESRU.safeImage, "no-restricted-imports").length === 0, ozet(MESRU.safeImage));

  // (d) Parola alanlarinda autoComplete ZORUNLU (21 Eylul 2026). Canlida
  // Chrome konsolu "[DOM] Input elements should have autocomplete attributes
  // (suggested: current-password)" basiyor ve ogeyi DEGERIYLE dokuyordu.
  // Kural: .eslintrc.json no-restricted-syntax (JSX secicisi).
  console.log("\n--- (d) parola alani autoComplete'siz → lint HATA");
  const parolaHata = kural(GECICI.parola, "no-restricted-syntax");
  const satirlar = parolaHata.map((m) => m.line).sort((a, b) => a - b);
  okTrue("parola", "🔴 autoComplete'siz <input type=\"password\"> → HATA", satirlar.includes(6), ozet(GECICI.parola));
  okTrue("parola", "🔴 autoComplete'siz <Input type=\"password\"> (bilesen) → HATA", satirlar.includes(7), ozet(GECICI.parola));
  okTrue("parola", "🔴 dinamik type={… \"password\"} autoComplete'siz → HATA", satirlar.includes(8), ozet(GECICI.parola));
  okTrue("parola", "autoComplete'li parola alani GECER (tam 3 hata)", parolaHata.length === 3 && !satirlar.includes(9), JSON.stringify(satirlar));
  okTrue("parola", "hata mesaji dogru degerleri soyluyor", parolaHata.length > 0 && parolaHata[0].message.includes("current-password") && parolaHata[0].message.includes("new-password"), parolaHata[0]?.message || "");

  console.log("\n--- (e) gercek parola formlari: kural temiz + dogru deger");
  for (const [yol, beklenen] of Object.entries(PAROLA_FORMLARI)) {
    const kaynak = readFileSync(path.join(REPO, yol), "utf8");
    const bloklar = [...kaynak.matchAll(/<(?:input|Input)\b[^>]*?type="password"[^>]*?>/gs)].map((m) => m[0]);
    const degerler = bloklar.map((b) => (b.match(/autoComplete="([^"]+)"/) || [])[1] || null);
    okTrue("parola", `${yol}: lint'te autoComplete hatasi YOK`, mesajlar(yol) !== null && kural(yol, "no-restricted-syntax").length === 0, ozet(yol));
    okTrue("parola", `${yol}: parola alanlari ${JSON.stringify(beklenen)}`, JSON.stringify(degerler) === JSON.stringify(beklenen), JSON.stringify(degerler));
  }
}

console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
process.exitCode = failures.length === 0 ? 0 : 1;
