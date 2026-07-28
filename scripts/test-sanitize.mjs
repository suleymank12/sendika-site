/**
 * sanitizeContentHtml fixture testi (Guvenlik bulgusu Y2).
 *
 * CALISTIRMA:
 *   npm run test:sanitize
 *   (= node --conditions=react-server scripts/test-sanitize.mjs)
 *
 * --conditions=react-server NEDEN GEREKLI:
 *   src/lib/sanitize.ts basinda `import "server-only"` var. O paket, React
 *   Server Component disinda import edilirse KASITLI olarak hata firlatir;
 *   react-server kosulu ise paketi bos modul'e cozer. Yani bu bayrak testin
 *   uretimdeki (RSC) kosullarini taklit etmesini saglar — sanitize.ts'i
 *   degistirmeden, gercek dosyayi test ederiz.
 *
 * .ts dosyasi Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import { sanitizeContentHtml } from "../src/lib/sanitize.ts";
import { isNextImageSafeUrl, extractImagesFromHtml } from "../src/lib/utils.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

/**
 * @param {string} group
 * @param {string} name
 * @param {string} input
 * @param {{ must?: (string|RegExp)[], mustNot?: (string|RegExp)[] }} expect
 */
function check(group, name, input, expect) {
  const out = sanitizeContentHtml(input);
  const problems = [];

  for (const needle of expect.must || []) {
    const hit =
      needle instanceof RegExp ? needle.test(out) : out.includes(needle);
    if (!hit) problems.push(`BEKLENEN VAR DEGIL: ${needle}`);
  }
  for (const needle of expect.mustNot || []) {
    const hit =
      needle instanceof RegExp ? needle.test(out) : out.includes(needle);
    if (hit) problems.push(`OLMAMASI GEREKEN VAR: ${needle}`);
  }

  if (problems.length === 0) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name, input, out, problems });
    console.log(`  FAIL  [${group}] ${name}`);
    for (const p of problems) console.log(`          ${p}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${out}`);
  }
}

// ---------------------------------------------------------------------------
// (a) XSS VEKTORLERI — hepsi etkisizlesmeli
// ---------------------------------------------------------------------------
console.log("\n(a) XSS vektorleri\n");

check("xss", "script tag + icerigi tamamen gider", '<p>merhaba</p><script>alert(1)</script>', {
  must: ["<p>merhaba</p>"],
  mustNot: ["<script", "alert(1)"],
});

check("xss", "img onerror handler'i dusurulur", '<img src="/x.jpg" onerror="alert(1)">', {
  mustNot: ["onerror", "alert(1)"],
});

check("xss", "a href javascript: dusurulur (metin kalir)", '<a href="javascript:alert(1)">tikla</a>', {
  must: ["tikla"],
  mustNot: ["javascript:", "href="],
});

check("xss", "a href vbscript: dusurulur", '<a href="vbscript:msgbox(1)">tikla</a>', {
  must: ["tikla"],
  mustNot: ["vbscript", "href="],
});

check("xss", "iframe tamamen gider", '<iframe src="https://evil.example/x"></iframe>', {
  mustNot: ["<iframe", "evil.example"],
});

check("xss", "svg + onload gider", '<svg onload="alert(1)"><circle r="1"/></svg>', {
  mustNot: ["<svg", "onload", "alert(1)", "<circle"],
});

check("xss", "style tag + icerigi gider", "<style>body{display:none}</style><p>ok</p>", {
  must: ["<p>ok</p>"],
  mustNot: ["<style", "display:none"],
});

check("xss", "form + input gider", '<form action="https://evil.example"><input name="p"></form>', {
  mustNot: ["<form", "<input", "evil.example"],
});

check("xss", "base tag gider", '<base href="https://evil.example/">', {
  mustNot: ["<base", "evil.example"],
});

check("xss", "img data: src'li tag dusurulur", '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">', {
  mustNot: ["<img", "data:"],
});

check("xss", "img protokol-goreli (//evil) dusurulur", '<img src="//evil.example/x.jpg">', {
  mustNot: ["<img", "evil.example"],
});

check("xss", "style icinde javascript: url() temizlenir", '<p style="background:url(javascript:alert(1))">x</p>', {
  must: ["<p", "x</p>"],
  mustNot: ["javascript", "background", "url("],
});

check("xss", "inline onclick dusurulur", '<p onclick="alert(1)">x</p>', {
  must: ["x</p>"],
  mustNot: ["onclick", "alert(1)"],
});

check("xss", "yabanci https host'lu img dusurulur (next/image cokme bulgusu)", '<img src="https://evil.example/x.jpg" alt="a">', {
  mustNot: ["<img", "evil.example"],
});

check("xss", "ic ice kacirma denemesi (scr<script>ipt)", "<scr<script>ipt>alert(1)</script>", {
  mustNot: ["<script", "<scr"],
});

check("xss", "object/embed gider", '<object data="x.swf"></object><embed src="y.swf">', {
  mustNot: ["<object", "<embed"],
});

check("xss", "izinsiz class dusurulur", '<p class="evil">x</p>', {
  must: ["x</p>"],
  mustNot: ["class="],
});

// ---------------------------------------------------------------------------
// (a2) img src KABUL KURALI
//      Kabul edilen TEK iki bicim: https://<alt>.supabase.co/... ve /...
//      Regresyon nedeni: <img src="x"> sanitize'dan gecip
//      extractImagesFromHtml -> next/image zincirinde "Failed to parse src"
//      ile sayfayi 500'e dusuruyordu.
// ---------------------------------------------------------------------------
console.log("\n(a2) img src kabul kurali\n");

const DROPPED_SRCS = [
  ['sema yok, yol yok ("x") — 500 bug\'inin kaynagi', "x"],
  ['dosya adi ("a.jpg")', "a.jpg"],
  ['nokta-goreli ("./a.png")', "./a.png"],
  ['ust dizin ("../a.png")', "../a.png"],
  ["protokol-goreli (//evil.com)", "//evil.com/a.jpg"],
  ["yabanci host + http", "http://evil.com/a.jpg"],
  ["supabase host AMA http (https degil)", "http://abc.supabase.co/storage/v1/object/public/images/a.webp"],
  ["bos src", ""],
];
for (const [name, src] of DROPPED_SRCS) {
  check("img-drop", name, `<p>once</p><img src="${src}"><p>sonra</p>`, {
    // Cevresindeki mesru icerik korunmali — sadece <img> dusmeli.
    must: ["<p>once</p>", "<p>sonra</p>"],
    mustNot: ["<img"],
  });
}

const KEPT_SRCS = [
  [
    "Supabase storage public URL",
    "https://abcdefgh.supabase.co/storage/v1/object/public/images/t-1/editor/a.webp",
  ],
  ["site-goreli (tek egik cizgi)", "/gorseller/a.webp"],
];
for (const [name, src] of KEPT_SRCS) {
  check("img-keep", name, `<img src="${src}" alt="a">`, {
    must: ["<img", `src="${src}"`, 'alt="a"'],
  });
}

// ---------------------------------------------------------------------------
// (b) MESRU TIPTAP CIKTISI — birebir korunmali
//     (Not: sanitize-html yeniden serilestirir; void tag'ler `<br />` bicimine,
//      style degerleri bosluksuz bicime donebilir. Bu yuzden anlamsal
//      korunma kontrol edilir, byte esitligi degil.)
// ---------------------------------------------------------------------------
console.log("\n(b) Mesru Tiptap ciktisi\n");

check("tiptap", "paragraf", "<p>Merhaba dunya</p>", { must: ["<p>Merhaba dunya</p>"] });

check("tiptap", "h1-h6 hepsi", "<h1>a</h1><h2>b</h2><h3>c</h3><h4>d</h4><h5>e</h5><h6>f</h6>", {
  must: ["<h1>a</h1>", "<h2>b</h2>", "<h3>c</h3>", "<h4>d</h4>", "<h5>e</h5>", "<h6>f</h6>"],
});

check("tiptap", "inline marklar (strong/em/u/s/code)", "<p><strong>a</strong><em>b</em><u>c</u><s>d</s><code>e</code></p>", {
  must: ["<strong>a</strong>", "<em>b</em>", "<u>c</u>", "<s>d</s>", "<code>e</code>"],
});

check("tiptap", "TextAlign: paragrafta text-align", '<p style="text-align: center">ortali</p>', {
  must: [/text-align:\s*center/, "ortali"],
});

check("tiptap", "TextAlign: baslikta 4 deger", '<h2 style="text-align: right">a</h2><h3 style="text-align: justify">b</h3><p style="text-align: left">c</p>', {
  must: [/text-align:\s*right/, /text-align:\s*justify/, /text-align:\s*left/],
});

check("tiptap", "bulletList", "<ul><li>bir</li><li>iki</li></ul>", {
  must: ["<ul>", "<li>bir</li>", "<li>iki</li>", "</ul>"],
});

check("tiptap", "orderedList start + type korunur", '<ol start="3" type="a"><li>x</li></ol>', {
  must: ['start="3"', 'type="a"', "<li>x</li>"],
});

check("tiptap", "blockquote", "<blockquote><p>alinti</p></blockquote>", {
  must: ["<blockquote>", "<p>alinti</p>", "</blockquote>"],
});

check("tiptap", "codeBlock language-* class'i korunur", '<pre><code class="language-javascript">const a = 1;</code></pre>', {
  must: ["<pre>", 'class="language-javascript"', "const a = 1;"],
});

check("tiptap", "code'da language DISI class dusurulur", '<code class="evil-class">x</code>', {
  must: ["<code", "x</code>"],
  mustNot: ["evil-class"],
});

check("tiptap", "hr ve br", "<p>a</p><hr><p>b<br>c</p>", {
  must: [/<hr\s*\/?>/, /<br\s*\/?>/],
});

check("tiptap", "https link: href korunur, rel/target zorlanir", '<a href="https://ornek.org/x">baglanti</a>', {
  must: ['href="https://ornek.org/x"', 'target="_blank"', 'rel="noopener noreferrer nofollow"', "baglanti"],
});

check("tiptap", "mailto link", '<a href="mailto:info@ornek.org">posta</a>', {
  must: ['href="mailto:info@ornek.org"', "posta"],
});

check("tiptap", "tel link", '<a href="tel:+902121234567">telefon</a>', {
  must: ['href="tel:+902121234567"', "telefon"],
});

check("tiptap", "site-goreli link korunur", '<a href="/haberler/ornek-haber">ic link</a>', {
  must: ['href="/haberler/ornek-haber"', "ic link"],
});

check("tiptap", "link title korunur", '<a href="https://ornek.org" title="baslik">x</a>', {
  must: ['title="baslik"'],
});

check(
  "tiptap",
  "Supabase storage gorseli (src/alt/title/width/height) korunur",
  '<img src="https://abcdefgh.supabase.co/storage/v1/object/public/images/t-1/editor/1700000000-abc.webp" alt="aciklama" title="baslik" width="640" height="480">',
  {
    must: [
      'src="https://abcdefgh.supabase.co/storage/v1/object/public/images/t-1/editor/1700000000-abc.webp"',
      'alt="aciklama"',
      'title="baslik"',
      'width="640"',
      'height="480"',
    ],
  }
);

check("tiptap", "site-goreli gorsel korunur", '<img src="/placeholder-logo.png" alt="logo">', {
  must: ['src="/placeholder-logo.png"', 'alt="logo"'],
});

check("tiptap", "tablo (eski/yapistirilmis icerik)", "<table><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>", {
  must: ["<table>", "<thead>", "<th>A</th>", "<tbody>", "<td>1</td>", "</table>"],
});

check("tiptap", "span ve div korunur", '<div><span>metin</span></div>', {
  must: ["<div>", "<span>metin</span>", "</div>"],
});

check("tiptap", "ic ice liste + mark kombinasyonu", "<ul><li><p><strong>a</strong></p><ul><li>b</li></ul></li></ul>", {
  must: ["<strong>a</strong>", "<li>b</li>"],
});

// ---------------------------------------------------------------------------
// (c) SOZLESME: null/undefined guvenli + idempotent
// ---------------------------------------------------------------------------
console.log("\n(c) Sozlesme kontrolleri\n");

const contractCases = [
  ["null girdi", null, ""],
  ["undefined girdi", undefined, ""],
  ["bos string", "", ""],
];
for (const [name, input, expected] of contractCases) {
  const out = sanitizeContentHtml(input);
  if (out === expected) {
    passed++;
    console.log(`  PASS  [sozlesme] ${name}`);
  } else {
    failures.push({ group: "sozlesme", name, input, out, problems: [`beklenen ${JSON.stringify(expected)}`] });
    console.log(`  FAIL  [sozlesme] ${name} -> ${JSON.stringify(out)}`);
  }
}

const MIXED = `
<h2 style="text-align: center">Baslik</h2>
<p>Metin <strong>kalin</strong> <a href="https://ornek.org">link</a></p>
<script>alert(1)</script>
<img src="https://abcdefgh.supabase.co/storage/v1/object/public/images/t/editor/a.webp" alt="x">
<img src="https://evil.example/x.jpg">
<ol start="2"><li>bir</li></ol>
<pre><code class="language-ts">const a=1</code></pre>
<p style="background:url(javascript:alert(1))" onclick="alert(2)">son</p>
`;
const once = sanitizeContentHtml(MIXED);
const twice = sanitizeContentHtml(once);
if (once === twice) {
  passed++;
  console.log("  PASS  [sozlesme] idempotent (karisik dokuman)");
} else {
  failures.push({ group: "sozlesme", name: "idempotent", input: MIXED, out: `1x:${once}\n2x:${twice}`, problems: ["iki gecis farkli sonuc verdi"] });
  console.log("  FAIL  [sozlesme] idempotent");
  console.log(`          1x: ${once}`);
  console.log(`          2x: ${twice}`);
}

console.log("\n--- karisik dokumanin sanitize ciktisi ---");
console.log(once.trim());
console.log("--- son ---\n");

// ---------------------------------------------------------------------------
// (d) IKINCI SAVUNMA KATMANI — isNextImageSafeUrl / extractImagesFromHtml
//     Sanitize atlansa veya kolon degeri (cover_image) bozuk olsa bile
//     next/image'a gecersiz src ULASMAMALI. Kural next.config.mjs
//     images.remotePatterns'i birebir yansitir.
// ---------------------------------------------------------------------------
console.log("\n(d) Ikinci katman: isNextImageSafeUrl\n");

/** @param {string} name @param {unknown} input @param {boolean} expected */
function checkSafeUrl(name, input, expected) {
  let actual;
  try {
    actual = isNextImageSafeUrl(input);
  } catch (err) {
    failures.push({ group: "next-image", name, input, out: String(err), problems: ["THROW ETTI — asla throw etmemeli"] });
    console.log(`  FAIL  [next-image] ${name} -> THROW: ${err}`);
    return;
  }
  if (actual === expected) {
    passed++;
    console.log(`  PASS  [next-image] ${name}`);
  } else {
    failures.push({ group: "next-image", name, input, out: String(actual), problems: [`beklenen ${expected}`] });
    console.log(`  FAIL  [next-image] ${name} -> ${actual} (beklenen ${expected})`);
  }
}

checkSafeUrl("supabase storage public URL", "https://abcdefgh.supabase.co/storage/v1/object/public/images/t/a.webp", true);
checkSafeUrl("site-goreli", "/gorseller/a.webp", true);
checkSafeUrl('"x"', "x", false);
checkSafeUrl('"a.jpg"', "a.jpg", false);
checkSafeUrl("protokol-goreli", "//evil.com/a.jpg", false);
checkSafeUrl("http (https degil)", "http://abcdefgh.supabase.co/storage/v1/object/public/images/a.webp", false);
checkSafeUrl("supabase host AMA yanlis pathname", "https://abcdefgh.supabase.co/rastgele/a.webp", false);
checkSafeUrl("yabanci https host", "https://evil.com/storage/v1/object/public/images/a.webp", false);
checkSafeUrl("data: URI", "data:image/png;base64,iVBORw0KGgo=", false);
checkSafeUrl("bos string", "", false);
checkSafeUrl("null", null, false);
checkSafeUrl("undefined", undefined, false);
// SafeImage senaryolari: Navbar logo_url'i "/placeholder-logo.png" olabilir
// (sentinel) — gecerli sayilmali; "x" gibi cop degerler ise elenmeli.
checkSafeUrl("Navbar sentinel /placeholder-logo.png", "/placeholder-logo.png", true);
checkSafeUrl("sadece bosluk", "   ", false);
checkSafeUrl("golge yol (../a.png)", "../a.png", false);

// extractImagesFromHtml: bozuk src'ler sessizce atlanmali, mesru olanlar kalmali
const EXTRACT_HTML =
  '<img src="x">' +
  '<img src="https://abcdefgh.supabase.co/storage/v1/object/public/images/t/a.webp">' +
  '<img src="//evil.com/b.jpg">' +
  '<img src="/gorseller/c.webp">';
const extracted = extractImagesFromHtml(EXTRACT_HTML);
const extractExpected = [
  "https://abcdefgh.supabase.co/storage/v1/object/public/images/t/a.webp",
  "/gorseller/c.webp",
];
if (JSON.stringify(extracted) === JSON.stringify(extractExpected)) {
  passed++;
  console.log("  PASS  [next-image] extractImagesFromHtml bozuk src'leri atlar");
} else {
  failures.push({ group: "next-image", name: "extractImagesFromHtml filtresi", input: EXTRACT_HTML, out: JSON.stringify(extracted), problems: [`beklenen ${JSON.stringify(extractExpected)}`] });
  console.log(`  FAIL  [next-image] extractImagesFromHtml -> ${JSON.stringify(extracted)}`);
}

// ---------------------------------------------------------------------------
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi\n`);
process.exit(failures.length === 0 ? 0 : 1);
