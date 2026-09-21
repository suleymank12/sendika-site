/**
 * COK KIRACILI IZOLASYON — HTTP TEST MATRISI (Faz 2, 21 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run izolasyon:tam      # build + next start (3100) + matris — ASLA atlamaz
 *   npm run izolasyon:temel    # ayni, sonunda TEMEL CIZGIYI kaydeder
 *   npm run test:izolasyon     # zaten ayakta olan PRODUCTION sunucuya karsi
 *                              # (IZOLASYON_URL, varsayilan http://127.0.0.1:3000)
 *
 * ## NEDEN VAR
 *
 * Diger ~2150 kontrolun neredeyse tamami BIZIM fonksiyonlarimizi siniyor.
 * Next surum yukseltmesi ise NEXT'IN davranisini degistiriyor: baslik
 * iletimi, onbellek anlami, nonce enjeksiyonu, matcher, gorsel ucu. Bir
 * musterinin baska musterinin icerigini gormesi gibi SESSIZ bir gerileme,
 * o kontrollerin hepsi yesilken olabilir. Bu betik uygulamaya DISARIDAN,
 * gercek HTTP ile, production build uzerinde bakar.
 *
 * ## IKI KATMAN
 *
 *   (1) KURALLAR — her kosuda PASS/FAIL: capraz kurum detayi 404, fail-closed,
 *       sahte baslik etkisiz, CSP nonce esitligi, gorsel ucu sozlesmesi...
 *   (2) TEMEL CIZGI FARKI — her hucrenin normalize gozlemi kaydedilir;
 *       yukseltmeden sonra ayni matris kosar ve FARK alinir. Kurallarin
 *       yakalamadigi davranis degisikligi (307→308, baslik adi, yeni
 *       yonlendirme...) burada gorunur. 🔴 Beklenmeyen HER fark kapidir.
 *
 * ## TEMEL CIZGI — nerede, nasil karsilastirilir
 *
 *   scripts/izolasyon-temel/next-<surum>.json   (repoda, git'te izlenir)
 *
 *   Karsilastirma hedefi (sirayla): IZOLASYON_TEMEL=<dosya> → kurulu Next
 *   surumunun dosyasi → yoksa ondan KUCUK en buyuk surumun dosyasi (yani
 *   14.2.35 → 15.5.25 gecisinde otomatik olarak 14.2.35 temel cizgisi).
 *   Fark varsa kosu KIRMIZI. Fark incelenip KABUL edilirse yeni surum icin
 *   `npm run izolasyon:temel` ile yeni dosya kaydedilir (eskisi silinmez;
 *   git diff'i inceleme kaydidir). Kural FAIL varken temel cizgi KAYDEDILMEZ.
 *
 * ## KARARLILIK (sahte fark uretmesin diye)
 *
 *   Kurum adlari, haber slug'lari, host'lar SEMBOLE cevrilir: A (default),
 *   B (custom domain'li ilk aktif kurum), {A.haber}, B-custom, storage...
 *   Icerik (yeni haber, isim degisikligi) fark URETMEZ; davranis uretir.
 *   Nonce degerleri kaydedilmez, yalniz TUTARLILIGI kaydedilir.
 *
 * ## BILINEN KUSURLAR (katı xfail)
 *
 *   14.2.35'te bugun var olan kusurlar BILINEN_KUSURLAR'da, iddia kimligiyle.
 *   Kirmizi yapmazlar ama HER kosuda listelenirler. Biri DUZELIRSE (iddia
 *   gecerse) kosu KIRMIZI olur: "listeden cikar" — liste yalan soyleyemez.
 *
 * ## ORTAM KAPISI — sessiz atlama YOK
 *
 *   Sunucu yoksa / dev sunucusuysa: buyuk bir ATLANDI bandi + "SONUC: ATLANDI
 *   (0 kontrol)" ve cikis 0. IZOLASYON_ZORUNLU=1 (izolasyon:tam bunu verir)
 *   iken cikis 1. Yerel sunucudaki build yerel .next/BUILD_ID'den farkliysa
 *   (eski build'e karsi kosuyor) cikis 1 — atlanmaz.
 *
 * ## KAPSAM SINIRI (bilincli)
 *
 *   - Oturumlu senaryolar YOK (A kurumunun yoneticisi B panelinde): canli
 *     veritabaninda test hesabi acmadan yapilamiyor. Veri siniri RLS'te;
 *     RLS testleri: test:super-admin-kurum, test:panel-yoneticileri.
 *   - 500 sayfasi tetiklenmiyor (saglikli uygulamada guvenli yol yok).
 *   - Onbellek gecersizlestirme (revalidateTag) elle tatbikat: NOTE.md.
 *   - Veri CANLI Supabase'den okunur (anon anahtar, yalniz okuma) — ayni
 *     yerel build + ayni veri = ayni gozlem.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import { SUPER_ADMIN_SUBDOMAIN } from "../src/lib/constants.ts";

// ---------------------------------------------------------------------------
// Ayarlar
// ---------------------------------------------------------------------------
const ARGS = new Set(process.argv.slice(2));
const KAYDET = ARGS.has("--kaydet");
const UZERINE_YAZ = ARGS.has("--uzerine-yaz");
const AYRINTI = ARGS.has("--ayrinti");
const ZORUNLU = process.env.IZOLASYON_ZORUNLU === "1";
const TABAN = (process.env.IZOLASYON_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const REPO = new URL("../", import.meta.url);
const TEMEL_DIZIN = new URL("izolasyon-temel/", import.meta.url);
const NEXT_SURUM = JSON.parse(readFileSync(new URL("node_modules/next/package.json", REPO), "utf8")).version;
const ESZAMANLI = 4;
const BILINMEYEN_SUB = "yok-boyle-kurum";
const BILINMEYEN_CUSTOM = "bilinmeyen-alan.example";
const SAHTE_IZ = "zzSAHTEizolasyon";

// .env.local → process.env (varsa; ortamdaki deger ONCELIKLI)
const envYol = new URL(".env.local", REPO);
if (existsSync(envYol)) {
  for (const satir of readFileSync(envYol, "utf8").split(/\r?\n/)) {
    const m = satir.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim();
  }
}

// ---------------------------------------------------------------------------
// Ortam kapisi
// ---------------------------------------------------------------------------
function atlandi(sebep) {
  const cizgi = "=".repeat(72);
  console.log(`\n${cizgi}\n  ⚠️  ATLANDI — IZOLASYON MATRISI KOSMADI (0 kontrol)\n  sebep: ${sebep}\n  kosturmak icin: npm run izolasyon:tam   (build + start + matris)\n${cizgi}\n`);
  console.log(`SONUC: ATLANDI (0 kontrol) — ${sebep}`);
  process.exit(ZORUNLU ? 1 : 0);
}

const ROOT = String(process.env.NEXT_PUBLIC_ROOT_DOMAIN || "").split(":")[0].toLowerCase();
const PORT = new URL(TABAN).port;
if (!ROOT) atlandi("NEXT_PUBLIC_ROOT_DOMAIN tanimsiz (.env.local)");
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) atlandi("Supabase env tanimsiz (.env.local)");
const OWN_STORAGE = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.toLowerCase();

/**
 * 🔴 `fetch` DEGIL, `node:http`: Node'un fetch'i (undici) `Host` basligini
 * SESSIZCE yok sayiyor (fetch standardinda yasak baslik) — istek her zaman
 * 127.0.0.1'e, yani APEX'e gider. Olculdu (21 Eylul 2026): ayni istek
 * fetch ile `x-tenant-slug: default`, http.get ile `kurmay-teknoloji`.
 * fetch'le yazilmis bir host matrisi butun host'lari apex sanar ve
 * "B'nin sitesi A'yi gosteriyor" diye SAHTE alarm verir — ya da tersine,
 * gercek bir sizintiyi hic goremez.
 */
function istek(host, yol, ek = {}, govdeOku = true, yontem = "GET") {
  const u = new URL(`${TABAN}${yol}`);
  const modul = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = modul.request(
      { protocol: u.protocol, hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: yontem, headers: { Host: host, Accept: "text/html", ...ek } },
      (res) => {
        const parcalar = [];
        res.on("data", (d) => govdeOku && parcalar.push(d));
        res.on("end", () => {
          const basliklar = {};
          for (const [k, v] of Object.entries(res.headers)) basliklar[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
          resolve({ durum: res.statusCode, basliklar, govde: Buffer.concat(parcalar).toString("utf8") });
        });
        res.on("error", reject);
      }
    );
    req.setTimeout(30000, () => req.destroy(new Error("zaman asimi")));
    req.on("error", reject);
    req.end();
  });
}

const APEX_HOST = PORT ? `${ROOT}:${PORT}` : ROOT;
{
  let yoklama;
  try {
    yoklama = await istek(APEX_HOST, "/haberler");
  } catch (e) {
    atlandi(`sunucu yanit vermiyor: ${TABAN} (${e.code || e.cause?.code || e.message})`);
  }
  const csp = yoklama.basliklar["content-security-policy"] || "";
  if (csp.includes("'unsafe-eval'")) atlandi("DEV sunucusu (CSP'de 'unsafe-eval') — matris PRODUCTION build ister");
  if (yoklama.durum >= 500) atlandi(`sunucu ${yoklama.durum} donuyor`);
}

// ---------------------------------------------------------------------------
// Veri (anon, salt okuma — uygulamanin kendisiyle ayni gorunurluk)
// ---------------------------------------------------------------------------
async function supa(yol) {
  const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${yol}`, {
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  });
  if (!r.ok) throw new Error(`supabase ${yol} → ${r.status}`);
  return r.json();
}
const kurumlar = await supa("tenants?select=id,slug,name,custom_domain,is_active");
const A = kurumlar.find((k) => k.slug === "default");
const B = kurumlar.filter((k) => k.slug !== "default" && k.is_active && k.custom_domain).sort((x, y) => x.slug.localeCompare(y.slug))[0];
if (!A || !B) {
  console.log("VERI YETERSIZ: 'default' kurumu ve custom domain'li ikinci bir aktif kurum gerekli.");
  console.log("SONUC: 0 gecti, 1 kaldi");
  process.exit(1);
}
const ayarlar = await supa("site_settings?select=tenant_id,value&key=eq.site_title");
const siteBaslik = Object.fromEntries(ayarlar.map((a) => [a.tenant_id, a.value]));
const haberler = await supa("news?select=slug,title,tenant_id,cover_image&is_published=eq.true&order=published_at.desc");
const duyurular = await supa("announcements?select=slug,title,tenant_id&is_published=eq.true&order=published_at.desc");
const sayfalar = await supa("pages?select=slug,title,tenant_id&is_published=eq.true");
const mansetler = await supa("headlines?select=id,tenant_id&is_active=eq.true");

const ilk = (liste, k, kosul = () => true) => liste.find((x) => x.tenant_id === k.id && kosul(x));
const HEDEF = {
  "A.haber": ilk(haberler, A, (h) => !!h.cover_image)?.slug && `/haberler/${ilk(haberler, A, (h) => !!h.cover_image).slug}`,
  "B.haber": ilk(haberler, B, (h) => !!h.cover_image)?.slug && `/haberler/${ilk(haberler, B, (h) => !!h.cover_image).slug}`,
  "A.duyuru": ilk(duyurular, A)?.slug && `/duyurular/${ilk(duyurular, A).slug}`,
  "B.duyuru": ilk(duyurular, B)?.slug && `/duyurular/${ilk(duyurular, B).slug}`,
  "A.sayfa": ilk(sayfalar, A)?.slug && `/sayfa/${ilk(sayfalar, A).slug}`,
  "B.sayfa": ilk(sayfalar, B)?.slug && `/sayfa/${ilk(sayfalar, B).slug}`,
  "A.manset": ilk(mansetler, A)?.id && `/manset/${ilk(mansetler, A).id}`,
  "B.manset": ilk(mansetler, B)?.id && `/manset/${ilk(mansetler, B).id}`,
};
const hedefYok = Object.entries(HEDEF).filter(([, v]) => !v).map(([k]) => k);

// Sizinti dedektoru: YALNIZ bir kuruma ait, ayirt edici (≥ 12 karakter) basliklar
const basliklar = { [A.id]: new Set(), [B.id]: new Set() };
for (const x of [...haberler, ...duyurular, ...sayfalar]) {
  if (basliklar[x.tenant_id] && x.title && x.title.trim().length >= 12) basliklar[x.tenant_id].add(x.title.trim());
}
const yalniz = (k, diger) => [...basliklar[k.id]].filter((t) => !basliklar[diger.id].has(t));
const ICERIK = { A: yalniz(A, B), B: yalniz(B, A) };

// ---------------------------------------------------------------------------
// Semboller
// ---------------------------------------------------------------------------
const HOSTLAR = [
  ["apex", APEX_HOST],
  ["A-sub", `${A.slug}.${APEX_HOST}`],
  ["B-sub", `${B.slug}.${APEX_HOST}`],
  ["B-custom", B.custom_domain],
  ["bilinmeyen-sub", `${BILINMEYEN_SUB}.${APEX_HOST}`],
  ["bilinmeyen-custom", BILINMEYEN_CUSTOM],
  ["superadmin", `${SUPER_ADMIN_SUBDOMAIN}.${APEX_HOST}`],
];
const HOST_ETIKET = new Map(HOSTLAR.map(([e, h]) => [h.split(":")[0].toLowerCase(), e]));
function hostEtiketi(host) {
  const h = String(host || "").toLowerCase().replace(/:\d+$/, "");
  if (HOST_ETIKET.has(h)) return HOST_ETIKET.get(h);
  if (h === OWN_STORAGE) return "storage";
  if (h === "localhost" || h === "127.0.0.1") return "localhost";
  return `YABANCI(${h})`;
}
// Kurumun kanonik (og:url) host etiketi — buildTenantPublicUrl: custom > apex(default)
const KANONIK = { A: "apex", B: "B-custom" };
// Host → beklenen kurum (bilinmeyen host'lar BELGELI olarak default'a duser — get-tenant.ts)
const BEKLENEN = { apex: "A", "A-sub": "A", "B-sub": "B", "B-custom": "B", "bilinmeyen-sub": "A", "bilinmeyen-custom": "A", superadmin: null };
const BEKLENEN_SLUG = { apex: A.slug, "A-sub": A.slug, "B-sub": B.slug, "B-custom": B.slug, "bilinmeyen-sub": BILINMEYEN_SUB, "bilinmeyen-custom": A.slug };
const DIGER = { A: "B", B: "A" };

const sembolMap = Object.entries(HEDEF).filter(([, v]) => v).map(([k, v]) => [v, `{${k}}`]);
function sembolik(yol) {
  let s = String(yol || "");
  for (const [somut, sembol] of sembolMap) s = s.split(somut).join(sembol);
  return s;
}
const entity = (s) => String(s || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
function kurumEtiketi(metin) {
  const t = entity(metin).trim();
  if (!t) return null;
  if (t === siteBaslik[A.id] || t === A.name) return "A";
  if (t === siteBaslik[B.id] || t === B.name) return "B";
  if (/bulunamad/i.test(t)) return "BULUNAMADI";
  if (t === "Platform Yönetimi") return "PANEL";
  if (t === "Site Kapalı") return "KAPALI";
  return `?(${t.slice(0, 40)})`;
}
function urlEtiketi(ham) {
  const r = entity(ham).trim();
  if (!r) return null;
  if (r.startsWith("/")) return `goreli:${sembolik(r.split("?")[0])}`;
  let u;
  try { u = new URL(r); } catch { return `BOZUK(${r.slice(0, 40)})`; }
  if (u.pathname === "/_next/image") {
    const ic = u.searchParams.get("url") || "";
    let icEt = "yok";
    try { icEt = ic.startsWith("/") ? "goreli" : hostEtiketi(new URL(ic).hostname); } catch { icEt = "BOZUK"; }
    return `${hostEtiketi(u.host)}/_next/image?w=${u.searchParams.get("w")}&q=${u.searchParams.get("q")}&url=${icEt}`;
  }
  const et = hostEtiketi(u.host);
  return et === "storage" ? "storage" : `${et}${sembolik(u.pathname)}`;
}
function tur(b) {
  const ct = (b["content-type"] || "").toLowerCase();
  if (!ct) return "yok";
  if (ct.includes("text/html")) return "html";
  if (ct.includes("text/x-component")) return "rsc";
  if (ct.includes("xml")) return "xml";
  if (ct.includes("text/plain")) return "text";
  if (ct.includes("json")) return "json";
  if (ct.startsWith("image/")) return ct.split(";")[0];
  return ct.split(";")[0];
}
function konum(b) {
  const l = b.location;
  if (!l) return null;
  if (l.startsWith("/")) return sembolik(l);
  try {
    const u = new URL(l);
    return `${hostEtiketi(u.host)}${sembolik(u.pathname + u.search)}`;
  } catch {
    return `BOZUK(${l})`;
  }
}
const meta = (govde, ad) => (govde.match(new RegExp(`<meta property="${ad}" content="([^"]*)"`)) || [])[1];
function sizintilar(govde, kurum) {
  const bak = kurum ? [DIGER[kurum]] : ["A", "B"];
  return bak.flatMap((k) => ICERIK[k].filter((t) => govde.includes(t) || govde.includes(t.replace(/&/g, "&amp;"))));
}
function cspGozlem(b, govde) {
  const ad = b["content-security-policy"] ? "Content-Security-Policy" : b["content-security-policy-report-only"] ? "Report-Only" : null;
  const deger = b["content-security-policy"] || b["content-security-policy-report-only"] || "";
  const nonce = (deger.match(/'nonce-([^']+)'/) || [])[1] || null;
  const attrlar = [...govde.matchAll(/\snonce="([^"]*)"/g)].map((m) => m[1]);
  return { ad, nonceVar: !!nonce, attrSayisiPozitif: attrlar.length > 0, hepsiEsit: !!nonce && attrlar.length > 0 && attrlar.every((x) => x === nonce) };
}

/**
 * NOTR BAS (K6, 21 Eylul 2026) — middleware'siz render edilen 404'un <head>'i
 * hicbir kurumu gostermemeli. Next'in kendi ekledikleri serbest: 404 icin
 * `robots: noindex` ve `app/favicon.ico`'nun `/favicon.ico` linki (platform
 * dosyasi, her host'ta ayni; olculdu).
 */
function notrBas(govde) {
  const bas = (govde.match(/<head>([\s\S]*?)<\/head>/) || [])[1] || "";
  const baslik = entity((bas.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  const ikonlar = [...bas.matchAll(/<link rel="(?:icon|shortcut icon|apple-touch-icon)" href="([^"]*)"/g)].map((m) => m[1]);
  return {
    baslik: baslik === "Sayfa Bulunamadı",
    ogYok: !/<meta property="og:/.test(bas),
    twitterYok: !/<meta name="twitter:/.test(bas),
    aciklamaYok: !/<meta name="description"/.test(bas),
    ikonYalnizPlatform: ikonlar.every((h) => h === "/favicon.ico"),
    noindexNofollow: bas.includes('<meta name="robots" content="noindex, nofollow"/>'),
  };
}

// ---------------------------------------------------------------------------
// Matris hucreleri
// ---------------------------------------------------------------------------
const YOLLAR = [
  ["/", "/"],
  ["/haberler", "/haberler"],
  ...Object.entries(HEDEF).filter(([, v]) => v).map(([k, v]) => [`{${k}}`, v]),
  ["/sitemap.xml", "/sitemap.xml"],
  ["/robots.txt", "/robots.txt"],
  ["/admin", "/admin"],
  ["/admin/giris", "/admin/giris"],
  ["/admin/haberler", "/admin/haberler"],
  ["/super-admin", "/super-admin"],
  ["/olmayan-sayfa", "/olmayan-sayfa"],
  // 21 Eylul 2026'ya kadar matcher DISIYDI (`api` ONEKI dislaniyordu: K1-K4).
  // Artik siradan yol — tam kurallarla sinanir; sinirin kendisi bolum (6)'da.
  ["/apix", "/apix"],
];
// Sayfa render eden ve bilincli olarak matcher disinda tutulan yol bu listede
// yok; matcher siniri bolum (6)'da ayrica muhurlu.
const MATCHER_DISI = new Set([]);
const hucreler = HOSTLAR.flatMap(([he, host]) => YOLLAR.map(([ya, yol]) => ({ he, host, ya, yol })));

async function havuz(isler, n) {
  const sonuc = new Array(isler.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < isler.length) { const j = i++; sonuc[j] = await isler[j](); }
  }));
  return sonuc;
}

function htmlGozlem(r) {
  const g = { durum: r.durum, konum: konum(r.basliklar), slug: r.basliklar["x-tenant-slug"] ?? null, tur: tur(r.basliklar) };
  if (g.tur === "html") {
    const baslik = (r.govde.match(/<title>([^<]*)<\/title>/) || [])[1];
    g.kurumBaslik = baslik === undefined ? null : kurumEtiketi(entity(baslik).split(" | ").pop());
    g.kurumOg = kurumEtiketi(meta(r.govde, "og:site_name"));
    g.ogUrl = urlEtiketi(meta(r.govde, "og:url"));
    g.ogImage = urlEtiketi(meta(r.govde, "og:image"));
    g.csp = cspGozlem(r.basliklar, r.govde);
  }
  if (g.tur === "xml") {
    const loc = [...r.govde.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
    g.locHostlari = [...new Set(loc.map((l) => { try { return hostEtiketi(new URL(l).host); } catch { return "BOZUK"; } }))].sort();
  }
  if (g.tur === "text" && r.durum === 200) {
    const sm = (r.govde.match(/Sitemap:\s*(\S+)/i) || [])[1];
    g.robotsSitemap = sm ? urlEtiketi(sm) : null;
  }
  return g;
}
function rscGozlem(r, bek) {
  const kurumlarVar = ["A", "B"].filter((k) => {
    const k0 = k === "A" ? A : B;
    return [siteBaslik[k0.id], k0.name].filter(Boolean).some((ad) => r.govde.includes(ad));
  });
  // RSC'de notFound()/redirect() HTTP 200 + yuk ici isaretle doner (Next'in
  // RSC davranisi) — durum kodu tek basina "404 mu" sorusunu cevaplamaz.
  const isaret = r.govde.includes("NEXT_NOT_FOUND") ? "notFound" : r.govde.includes("NEXT_REDIRECT") ? "redirect" : null;
  return {
    durum: r.durum, konum: konum(r.basliklar), slug: r.basliklar["x-tenant-slug"] ?? null, tur: tur(r.basliklar),
    kurumlar: kurumlarVar, isaret, sizinti: sizintilar(r.govde, bek).length,
  };
}

console.log(`Izolasyon matrisi — Next ${NEXT_SURUM} — ${TABAN}`);
console.log(`Kurumlar: A=${A.slug}  B=${B.slug} (custom ${B.custom_domain})  hucre=${hucreler.length}`);
if (hedefYok.length) console.log(`⚠️  Veride hedefi olmayan yollar (matrise GIRMEDI): ${hedefYok.join(", ")}`);

// Build kimligi (eski build'e karsi kosma tuzagi)
const rscKok = await istek(APEX_HOST, "/", { RSC: "1", Accept: "text/x-component" });
const sunucuBuild = (rscKok.govde.match(/(?:^|\n)0:\["([^"]+)"/) || [])[1] || null;
const yerelBuildYol = new URL(".next/BUILD_ID", REPO);
const yerelBuild = existsSync(yerelBuildYol) ? readFileSync(yerelBuildYol, "utf8").trim() : null;
const yerelSunucu = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(TABAN);

const htmlR = await havuz(hucreler.map((h) => () => istek(h.host, h.yol)), ESZAMANLI);
// Sahte slug = duz yanitin GOSTERMEDIGI kurum. Sabit bir deger (ornegin B
// host'unda hep A) secilseydi, zaten A gosteren bir hucrede (K4) sahte
// basligin kabul edildigi hic gorulemezdi.
const sahteSlug = (i) => (htmlGozlem(htmlR[i]).kurumBaslik === "B" || htmlGozlem(htmlR[i]).kurumOg === "B" ? A.slug : B.slug);
const [rscR, prefR, sahteR] = await Promise.all([
  havuz(hucreler.map((h) => () => istek(h.host, h.yol, { RSC: "1", Accept: "text/x-component" })), ESZAMANLI),
  havuz(hucreler.map((h) => () => istek(h.host, h.yol, { RSC: "1", "Next-Router-Prefetch": "1", Accept: "text/x-component" })), ESZAMANLI),
  havuz(hucreler.map((h, i) => () => istek(h.host, h.yol, {
    "x-tenant-slug": sahteSlug(i),
    "Content-Security-Policy": `script-src 'nonce-${SAHTE_IZ}"x'`,
    "x-nonce": SAHTE_IZ,
  })), ESZAMANLI),
]);

// Gorsel ucu
const kaynakSayfa = await istek(APEX_HOST, "/haberler");
const ornekGorsel = entity((kaynakSayfa.govde.match(/\/_next\/image\?url=([^"&\s]+)&amp;w=\d+&amp;q=75/) || [])[1] || "");
const kendi = ornekGorsel ? decodeURIComponent(ornekGorsel) : null;
const gorselUrl = (u, w = 1200, q = 75) => `/_next/image?url=${encodeURIComponent(u)}&w=${w}&q=${q}`;
const GORSEL = kendi ? [
  ["w1200-q75", gorselUrl(kendi), "image/webp,*/*"],
  ["w1201", gorselUrl(kendi, 1201), "image/webp,*/*"],
  ["q50", gorselUrl(kendi, 1200, 50), "image/webp,*/*"],
  ["baska-proje", gorselUrl(kendi.replace(OWN_STORAGE, "saldirganprojeabcdef.supabase.co")), "image/webp,*/*"],
  ["sonek-hilesi", gorselUrl(kendi.replace(OWN_STORAGE, `${OWN_STORAGE}.evil.test`)), "image/webp,*/*"],
  ["url-yok", "/_next/image?w=1200&q=75", "image/webp,*/*"],
  ["accept-avif", gorselUrl(kendi), "image/avif,image/webp,*/*"],
  ["accept-yildiz", gorselUrl(kendi), "*/*"],
] : [];
const gorselR = await havuz(GORSEL.map(([, yol, acc]) => () => istek(APEX_HOST, yol, { Accept: acc })), 2);
// Hata yanitinin METNI de kaydedilir: yalniz durum koduna bakmak yetmez —
// kural genisleyip Next yabanci adrese GERCEKTEN giderse, upstream'in
// kendi 400'u "izin yok" 400'uyle karisirdi.
const gorselHata = (r) => (r.durum >= 400 ? r.govde.replace(/\s+/g, " ").trim().slice(0, 80) : null);

// ---------------------------------------------------------------------------
// (6) Matcher SINIRI — middleware nerede calisiyor, nerede calismiyor
// ---------------------------------------------------------------------------
// 21 Eylul 2026: matcher onek dislamadan TAM YOL dislamaya gecti
// (`api/`, `_next/static/`, `_next/image$`, `favicon\.ico$`). Iki yon de
// muhurlenir:
//   ICERIDE — eskiden onek yuzunden disarida kalan yollar artik middleware'den
//             gecer ve SIRADAN bir 404 ile (/olmayan-sayfa) BIREBIR ayni davranir
//             (beklenmedik yonlendirme/baslik YOK)
//   DISARIDA — /api/… (route handler'lar kurumu host'tan kendileri cozer),
//             /_next/static/… ve /_next/image (performans), /favicon.ico:
//             middleware CALISMAZ (x-tenant-slug ve CSP basligi YOK)
const SINIR_HOSTLARI = HOSTLAR.filter(([he]) => ["apex", "B-custom", "superadmin"].includes(he));
const statikParca = ((await istek(APEX_HOST, "/")).govde.match(/\/_next\/static\/chunks\/[^"']+\.js/) || [])[0] || null;
const SINIR_ICERIDE = ["/api", "/apiler", "/api-x", "/_next/staticx", "/favicon.ico.bak"];
const SINIR_DISARIDA = [
  ["/api/contact", "/api/contact"], // GET → 405 (yalniz POST var)
  ["/api/yok-boyle-uc", "/api/yok-boyle-uc"],
  ["{statik-parca}", statikParca],
  ["/_next/static/yok.js", "/_next/static/yok.js"],
  ["/favicon.ico", "/favicon.ico"],
  ["/_next/image(gecerli)", kendi ? gorselUrl(kendi) : null],
  ["/_next/imagex", "/_next/imagex"],
].filter(([, yol]) => yol);
const sinirIcerideR = await havuz(SINIR_HOSTLARI.flatMap(([he, host]) => SINIR_ICERIDE.map((yol) => async () => ({ he, yol, r: await istek(host, yol) }))), ESZAMANLI);
const sinirDisaridaR = await havuz(SINIR_HOSTLARI.flatMap(([he, host]) => SINIR_DISARIDA.map(([ad, yol]) => async () => ({ he, ad, r: await istek(host, yol) }))), ESZAMANLI);
// Matcher DISINDAKI 404'ler sahte baslikla (21 Eylul 2026, K6 turu): orada
// middleware calismadigi icin gelen `x-tenant-slug`'i ezen kimse yok. Canlida
// nginx basligi siliyor; bu istekler UYGULAMA katmanini olcer (K7).
const SAHTE_SINIR = ["/api/yok-boyle-uc", "/_next/static/yok.js"];
const sinirSahteSlug = (he) => (BEKLENEN[he] === "B" ? A.slug : B.slug);
const sinirSahteR = await havuz(SINIR_HOSTLARI.flatMap(([he, host]) => SAHTE_SINIR.map((ad) => async () => ({ he, ad, r: await istek(host, ad, { "x-tenant-slug": sinirSahteSlug(he) }) }))), ESZAMANLI);

// ---------------------------------------------------------------------------
// (7) /api catch-all — gercek route'lar ONCE, olmayan yol JSON 404
// ---------------------------------------------------------------------------
// K6 (a), 21 Eylul 2026: `app/api/[...yol]/route.ts` `/api/` altinda OLMAYAN
// her yola JSON 404 veriyor (eskiden middleware'siz HTML 404 → default kurumun
// kimligi). Olculen iki sey:
//   - Next her GERCEK route dosyasini catch-all'dan ONCE esliyor. Dosyalar
//     DISKTEN sayilir: yeni route eklenince kendiliginden kapsama girer.
//     GET'i olmayan uca GET → 405 (catch-all'in 404'u DEGIL).
//   - catch-all'in 404'u, super admin uclarinin musteri domainindeki
//     404'uyle AYIRT EDILEMEZ (ayni fonksiyon: apiNotFound) — musteri
//     domaininde /api/ altinda tek 404 bicimi. (Gizlilik degil: uc adlari
//     panelin acik JS'inde zaten var — bkz. api-host-guard apiNotFound.)
// Istekler OTURUMSUZ: her gercek GET ucu host kapisindan ya da auth'tan
// (401) doner, veriye inmez (kod okundu). Gercek uclara POST ATILMAZ.
const CATCHALL = JSON.stringify({ error: "Bulunamadı." });
const API_KOK = new URL("src/app/api/", REPO);
function routeDosyalari(dizin = "", onek = "") {
  const out = [];
  for (const ad of readdirSync(new URL(dizin || ".", API_KOK)).sort()) {
    if (ad.startsWith("[")) continue; // catch-all'in kendisi
    const alt = `${dizin}${ad}`;
    if (statSync(new URL(alt, API_KOK)).isDirectory()) out.push(...routeDosyalari(`${alt}/`, `${onek}/${ad}`));
    else if (ad === "route.ts") out.push({ yol: `/api${onek}`, get: /export\s+(async\s+function|const)\s+GET\b/.test(readFileSync(new URL(alt, API_KOK), "utf8")) });
  }
  return out;
}
const GERCEK_API = routeDosyalari();
const hostAdi = (he) => HOSTLAR.find(([e]) => e === he)[1];
const API_ISLER = [
  ...GERCEK_API.map((r) => ({ ...r, he: r.yol.startsWith("/api/super-admin/") ? "superadmin" : "apex", sinif: "gercek" })),
  ...GERCEK_API.filter((r) => r.get && r.yol.startsWith("/api/super-admin/")).map((r) => ({ ...r, he: "B-custom", sinif: "musteri-host" })),
  { yol: "/api/super-admin", he: "B-custom", sinif: "catch-all" },
  { yol: "/api/contact/fazla", he: "apex", sinif: "catch-all" },
  { yol: "/api/super-admin/yok", he: "superadmin", sinif: "catch-all" },
  { yol: "/api/yok-boyle-uc", he: "B-custom", sinif: "catch-all", yontem: "POST" },
];
const apiAnahtar = (x) => `api|${x.yontem ? `${x.yontem} ` : ""}${x.yol}|${x.he}`;
const apiR = await havuz(API_ISLER.map((x) => async () => ({ x, r: await istek(hostAdi(x.he), x.yol, { Accept: "application/json" }, true, x.yontem || "GET") })), ESZAMANLI);
// Middleware izi: x-tenant-slug YA DA nonce'lu CSP. Yalniz "CSP var mi"ya
// bakmak YANLIS: Next'in gorsel ucu optimize gorsele kendi CSP'sini koyuyor
// (images.contentSecurityPolicy varsayilani `script-src 'none'; …; sandbox;`,
// nonce'suz) — olculdu. Bizim middleware'in CSP'si her zaman 'nonce-…' icerir.
const middlewareCalisti = (b) =>
  !!(b["x-tenant-slug"] || /'nonce-/.test(b["content-security-policy"] || "") || /'nonce-/.test(b["content-security-policy-report-only"] || ""));

// ---------------------------------------------------------------------------
// Gozlem belgesi
// ---------------------------------------------------------------------------
const gozlem = {};
hucreler.forEach((h, i) => {
  gozlem[`html|${h.he}|${h.ya}`] = htmlGozlem(htmlR[i]);
  gozlem[`rsc|${h.he}|${h.ya}`] = rscGozlem(rscR[i], BEKLENEN[h.he]);
  gozlem[`prefetch|${h.he}|${h.ya}`] = rscGozlem(prefR[i], BEKLENEN[h.he]);
  const s = htmlGozlem(sahteR[i]);
  const d = gozlem[`html|${h.he}|${h.ya}`];
  const alanlar = ["durum", "konum", "slug", "kurumBaslik", "kurumOg", "ogUrl", "ogImage"];
  gozlem[`sahte|${h.he}|${h.ya}`] = {
    farkliAlanlar: alanlar.filter((a) => JSON.stringify(s[a]) !== JSON.stringify(d[a])),
    yansima: sahteR[i].govde.includes(SAHTE_IZ),
  };
});
GORSEL.forEach(([ad], i) => { gozlem[`gorsel|${ad}`] = { durum: gorselR[i].durum, tur: tur(gorselR[i].basliklar), hata: gorselHata(gorselR[i]) }; });
if (!kendi) gozlem["gorsel|ornek"] = { durum: "ORNEK-GORSEL-YOK" };
for (const { he, yol, r } of sinirIcerideR) gozlem[`sinir|${he}|${yol}`] = { ...htmlGozlem(r), middleware: middlewareCalisti(r.basliklar) };
function disariGozlem(r) {
  const g = { durum: r.durum, tur: tur(r.basliklar), middleware: middlewareCalisti(r.basliklar) };
  if (g.tur === "html") Object.assign(g, (({ kurumBaslik, kurumOg }) => ({ kurumBaslik, kurumOg }))(htmlGozlem(r)));
  // JSON govdesi (catch-all'in 404'u) de kaydedilir: yalniz durum koduna
  // bakmak, baska bir 404'u (ornegin guard'inkini) bununla karistirirdi.
  if (g.tur === "json") g.hata = gorselHata(r);
  return g;
}
for (const { he, ad, r } of sinirDisaridaR) gozlem[`sinir|${he}|${ad}`] = disariGozlem(r);
for (const { he, ad, r } of sinirSahteR) gozlem[`sinir-sahte|${he}|${ad}`] = disariGozlem(r);
for (const { x, r } of apiR) gozlem[apiAnahtar(x)] = { durum: r.durum, tur: tur(r.basliklar), hata: gorselHata(r) };

// ---------------------------------------------------------------------------
// Kurallar
// ---------------------------------------------------------------------------
const iddialar = [];
const iddia = (bolum, id, kosul, ayrinti = "") => iddialar.push({ bolum, id, ok: kosul === true, ayrinti });

const CAPRAZ = (he, ya) => {
  const m = ya.match(/^\{([AB])\./);
  if (!m) return null;
  const beklenen = BEKLENEN[he];
  if (!beklenen) return null;
  return m[1] !== beklenen ? "yabanci" : "kendi";
};

for (const h of hucreler) {
  const g = gozlem[`html|${h.he}|${h.ya}`];
  const b = `${h.he}|${h.ya}`;
  const bek = BEKLENEN[h.he];
  const matcherDisi = MATCHER_DISI.has(h.ya);

  // --- (1) host × yol
  if (h.he === "superadmin") {
    if (h.ya === "/") iddia("1", `${b}|panele-yonlendirir`, g.durum === 307 && g.konum === "/super-admin", JSON.stringify(g));
    else if (h.ya === "/super-admin") iddia("1", `${b}|girise-yonlendirir`, g.durum === 307 && String(g.konum).startsWith("/super-admin/giris"), JSON.stringify(g));
    else if (!matcherDisi) iddia("1", `${b}|404-duz-metin`, g.durum === 404 && g.tur === "text" && !g.konum, JSON.stringify(g));
    iddia("1", `${b}|kurum-gostermez`, !["A", "B"].includes(g.kurumBaslik) && !["A", "B"].includes(g.kurumOg), JSON.stringify(g));
    iddia("1", `${b}|sizinti-yok`, sizintilar(htmlR[hucreler.indexOf(h)].govde, null).length === 0);
    continue;
  }
  const govde = htmlR[hucreler.indexOf(h)].govde;
  iddia("1", `${b}|sizinti-yok`, sizintilar(govde, bek).length === 0, sizintilar(govde, bek).join(" | "));
  iddia("1", `${b}|baska-kurum-gorunmez`, g.kurumBaslik !== DIGER[bek] && g.kurumOg !== DIGER[bek], JSON.stringify(g));

  if (h.ya === "/super-admin") {
    iddia("1", `${b}|super-admin-404-yonlendirme-yok`, g.durum === 404 && !g.konum, JSON.stringify(g));
    continue;
  }
  if (h.ya.startsWith("/admin")) {
    if (h.he === "bilinmeyen-custom") {
      iddia("1", `${b}|fail-closed`, g.durum === 307 && g.konum === "/admin/tenant-bulunamadi", JSON.stringify(g));
    } else if (h.ya === "/admin/giris") {
      if (h.he === "bilinmeyen-sub") iddia("1", `${b}|kurum-bulunamadi`, g.durum === 200 && g.kurumBaslik === "BULUNAMADI", JSON.stringify(g));
      else iddia("1", `${b}|giris-kendi-kurumu`, g.durum === 200 && g.kurumBaslik === bek && g.slug === BEKLENEN_SLUG[h.he], JSON.stringify(g));
    } else {
      iddia("1", `${b}|oturumsuz-girise`, g.durum === 307 && String(g.konum).startsWith("/admin/giris?next="), JSON.stringify(g));
    }
    continue;
  }
  // public yollar
  if (!matcherDisi) iddia("1", `${b}|x-tenant-slug`, g.slug === BEKLENEN_SLUG[h.he], `gelen=${g.slug}`);
  else iddia("1", `${b}|matcher-disi-kendi-kurumu`, g.kurumBaslik === bek || g.kurumBaslik === "BULUNAMADI", JSON.stringify(g));
  const capraz = CAPRAZ(h.he, h.ya);
  if (capraz === "yabanci") iddia("1", `${b}|🔴 capraz-detay-404`, g.durum === 404, `durum=${g.durum}`);
  // Kendi detayi: 200 — ya da haber kaynakli mansette KENDI haberine 307
  // (027_headlines_kaynak_tekil: mansetin kaynagi haberse detay haberdir).
  if (capraz === "kendi") {
    // konum sembolik: "/haberler/<slug>" tamami "{B.haber}" olur
    iddia("1", `${b}|kendi-detay-acilir`, g.durum === 200 || (g.durum === 307 && String(g.konum).startsWith(`{${bek}.`)), `durum=${g.durum} konum=${g.konum}`);
  }
  if (g.tur === "html") {
    if (h.he !== "bilinmeyen-sub") iddia("1", `${b}|kurum-baslik`, g.kurumBaslik === bek, `kurumBaslik=${g.kurumBaslik}`);
    if (g.kurumOg) iddia("1", `${b}|og-site-name`, g.kurumOg === bek, `kurumOg=${g.kurumOg}`);
    if (g.ogUrl) iddia("1", `${b}|og-url-host`, !g.ogUrl.startsWith(KANONIK[DIGER[bek]]) && !g.ogUrl.includes("YABANCI"), g.ogUrl);
    if (g.ogImage) iddia("1", `${b}|og-image-host`, !g.ogImage.startsWith(KANONIK[DIGER[bek]]) && !g.ogImage.includes("YABANCI") && !/url=(?!storage|goreli)/.test(g.ogImage.split("?")[1] || "url=storage"), g.ogImage);
  }
  if (h.ya === "/sitemap.xml") iddia("1", `${b}|sitemap-tek-kanonik-host`, g.durum === 200 && JSON.stringify(g.locHostlari) === JSON.stringify([KANONIK[bek]]), JSON.stringify(g.locHostlari));
  if (h.ya === "/robots.txt") iddia("1", `${b}|robots-sitemap-host`, g.durum === 200 && String(g.robotsSitemap).startsWith(KANONIK[bek]), String(g.robotsSitemap));
}

// --- (2) RSC / prefetch
for (const varyant of ["rsc", "prefetch"]) {
  for (const h of hucreler) {
    const r = gozlem[`${varyant}|${h.he}|${h.ya}`];
    const d = gozlem[`html|${h.he}|${h.ya}`];
    const b = `${varyant}|${h.he}|${h.ya}`;
    const bek = BEKLENEN[h.he];
    // Middleware yonlendirmesi (fail-closed, oturumsuz giris, super admin
    // kurallari) RSC'de de AYNI olmali — istemci gezinmesi bu yoldan gider.
    const middlewareYonlendirmesi = d.durum >= 300 && d.durum < 400 && (h.he === "superadmin" || h.ya.startsWith("/admin") || h.ya === "/super-admin");
    if (middlewareYonlendirmesi) iddia("2", `${b}|middleware-yonlendirmesi-ayni`, r.durum === d.durum && r.konum === d.konum, `rsc=${r.durum} ${r.konum} html=${d.durum} ${d.konum}`);
    if (d.durum === 404 && d.tur === "text") iddia("2", `${b}|duz-404-ayni`, r.durum === 404, `rsc=${r.durum}`);
    iddia("2", `${b}|icerik-sizintisi-yok`, r.sizinti === 0, `sizinti=${r.sizinti}`);
    if (h.he === "superadmin") { iddia("2", `${b}|kurum-yok`, r.kurumlar.length === 0, r.kurumlar.join()); continue; }
    iddia("2", `${b}|baska-kurum-yok`, !r.kurumlar.includes(DIGER[bek]), r.kurumlar.join());
    if (CAPRAZ(h.he, h.ya) === "yabanci" && varyant === "rsc") {
      iddia("2", `${b}|🔴 capraz-detay-notFound`, r.isaret === "notFound" || r.durum === 404, `durum=${r.durum} isaret=${r.isaret}`);
    }
    if (r.durum === 200 || r.durum === 404) {
      if (!MATCHER_DISI.has(h.ya) && !h.ya.startsWith("/admin/") && h.ya !== "/super-admin") {
        iddia("2", `${b}|x-tenant-slug`, r.slug === BEKLENEN_SLUG[h.he], `gelen=${r.slug}`);
      }
      if (r.tur === "rsc" && varyant === "rsc" && h.he !== "bilinmeyen-sub" && !h.ya.startsWith("/admin")) {
        iddia("2", `${b}|yukte-kendi-kurumu`, r.kurumlar.includes(bek), r.kurumlar.join());
      }
    }
  }
}

// --- (3) sahte baslik
for (const h of hucreler) {
  const s = gozlem[`sahte|${h.he}|${h.ya}`];
  const b = `sahte|${h.he}|${h.ya}`;
  iddia("3", `${b}|etkisiz`, s.farkliAlanlar.length === 0, `farkli: ${s.farkliAlanlar.join(",")}`);
  iddia("3", `${b}|nonce-yansimaz`, !s.yansima);
}

// --- (4) CSP uctan uca — HER html yaniti
for (const h of hucreler) {
  const g = gozlem[`html|${h.he}|${h.ya}`];
  if (g.tur !== "html") continue;
  const b = `csp|${h.he}|${h.ya}`;
  iddia("4", `${b}|zorlayici-baslik`, g.csp.ad === "Content-Security-Policy" && g.csp.nonceVar, JSON.stringify(g.csp));
  iddia("4", `${b}|nonce-hepsi-esit`, g.csp.hepsiEsit, JSON.stringify(g.csp));
}

// --- (5) gorsel ucu
const gz = (ad) => gozlem[`gorsel|${ad}`];
if (!kendi) iddia("5", "gorsel|ornek-bulundu", false, "/haberler'de q=75 gorsel yok");
else {
  iddia("5", "gorsel|w1200-q75 → 200", gz("w1200-q75").durum === 200 && gz("w1200-q75").tur.startsWith("image/"), JSON.stringify(gz("w1200-q75")));
  iddia("5", "gorsel|w1201 → 400", gz("w1201").durum === 400, JSON.stringify(gz("w1201")));
  iddia("5", "gorsel|q50 → 400 (uygulama tek basina)", gz("q50").durum === 400, JSON.stringify(gz("q50")));
  const izinYok = (g) => g.durum === 400 && String(g.hata).includes('"url" parameter is not allowed');
  iddia("5", "gorsel|🔴 baska Supabase projesi → 400 'is not allowed' (hic gidilmez)", izinYok(gz("baska-proje")), JSON.stringify(gz("baska-proje")));
  iddia("5", "gorsel|sonek hilesi → 400 'is not allowed'", izinYok(gz("sonek-hilesi")), JSON.stringify(gz("sonek-hilesi")));
  iddia("5", "gorsel|url yok → 400", gz("url-yok").durum === 400, JSON.stringify(gz("url-yok")));
  iddia("5", "gorsel|Accept avif → 200 ama AVIF URETILMEZ", gz("accept-avif").durum === 200 && gz("accept-avif").tur !== "image/avif", JSON.stringify(gz("accept-avif")));
  iddia("5", "gorsel|Accept */* → 200 gorsel", gz("accept-yildiz").durum === 200 && gz("accept-yildiz").tur.startsWith("image/"), JSON.stringify(gz("accept-yildiz")));
}

// --- (6) matcher siniri
const SINIRDA_KARSILASTIR = ["durum", "konum", "slug", "tur", "kurumBaslik", "kurumOg", "ogUrl", "ogImage", "csp", "middleware"];
for (const [he] of SINIR_HOSTLARI) {
  const olmayan = { ...gozlem[`html|${he}|/olmayan-sayfa`], middleware: middlewareCalisti(htmlR[hucreler.findIndex((h) => h.he === he && h.ya === "/olmayan-sayfa")].basliklar) };
  for (const yol of SINIR_ICERIDE) {
    const g = gozlem[`sinir|${he}|${yol}`];
    const farkli = SINIRDA_KARSILASTIR.filter((a) => JSON.stringify(g[a]) !== JSON.stringify(olmayan[a]));
    iddia("6", `sinir|${he}|${yol}|siradan-404-ile-birebir`, farkli.length === 0, `farkli: ${farkli.map((a) => `${a}=${JSON.stringify(g[a])}≠${JSON.stringify(olmayan[a])}`).join(" ")}`);
  }
  for (const [ad] of SINIR_DISARIDA) {
    const g = gozlem[`sinir|${he}|${ad}`];
    iddia("6", `sinir|${he}|${ad}|middleware-calismadi`, g.middleware === false, JSON.stringify(g));
    if (g.tur === "html" && BEKLENEN[he]) iddia("6", `sinir|${he}|${ad}|baska-kurum-gorunmez`, g.kurumBaslik !== DIGER[BEKLENEN[he]] && g.kurumOg !== DIGER[BEKLENEN[he]], JSON.stringify(g));
    // K6 (b): matcher disindaki HTML 404 HICBIR kurumun kimligini tasiyamaz —
    // middleware calismadi, hangi kurumun host'unda olundugu BILINMIYOR.
    // "baska-kurum-gorunmez"den siki: apex'te A'yi gostermek de yanlis tahmin.
    if (g.tur === "html") iddia("6", `sinir|${he}|${ad}|kurum-gostermez`, !["A", "B"].includes(g.kurumBaslik) && !["A", "B"].includes(g.kurumOg), JSON.stringify(g));
  }
  // K6 (a): /api/ altinda olmayan yol HTML degil, catch-all'in JSON 404'u
  const apiYok = gozlem[`sinir|${he}|/api/yok-boyle-uc`];
  iddia("6", `sinir|${he}|/api/yok-boyle-uc|json-404`, apiYok.durum === 404 && apiYok.tur === "json" && apiYok.hata === CATCHALL, JSON.stringify(apiYok));
  // K6 (b): kurum host'larinda notr BAS — ayrinti notrBas()
  if (BEKLENEN[he]) {
    const k = notrBas(sinirDisaridaR.find((x) => x.he === he && x.ad === "/_next/static/yok.js")?.r.govde || "");
    iddia("6", `sinir|${he}|/_next/static/yok.js|notr-bas`, Object.values(k).every(Boolean), JSON.stringify(k));
  }
  // Sahte baslik matcher disinda da etkisiz olmali (K7: /_next/static/ acik)
  for (const ad of SAHTE_SINIR) {
    const s = gozlem[`sinir-sahte|${he}|${ad}`], d = gozlem[`sinir|${he}|${ad}`];
    const farkli = ["durum", "tur", "kurumBaslik", "kurumOg", "hata"].filter((a) => JSON.stringify(s[a]) !== JSON.stringify(d[a]));
    iddia("6", `sinir-sahte|${he}|${ad}|etkisiz`, farkli.length === 0, `sahte x-tenant-slug=${sinirSahteSlug(he)} farkli: ${farkli.map((a) => `${a}=${JSON.stringify(s[a])}≠${JSON.stringify(d[a])}`).join(" ")}`);
  }
  if (gozlem[`sinir|${he}|/api/contact`]) iddia("6", `sinir|${he}|/api/contact|route-handler-cevapladi-405`, gozlem[`sinir|${he}|/api/contact`].durum === 405, JSON.stringify(gozlem[`sinir|${he}|/api/contact`]));
  if (gozlem[`sinir|${he}|{statik-parca}`]) iddia("6", `sinir|${he}|{statik-parca}|200`, gozlem[`sinir|${he}|{statik-parca}`].durum === 200, JSON.stringify(gozlem[`sinir|${he}|{statik-parca}`]));
  iddia("6", `sinir|${he}|/favicon.ico|200`, gozlem[`sinir|${he}|/favicon.ico`].durum === 200, JSON.stringify(gozlem[`sinir|${he}|/favicon.ico`]));
}
iddia("6", "sinir|statik parca HTML'de bulundu", !!statikParca, "anasayfada /_next/static/chunks/*.js yok");

// --- (7) /api catch-all
for (const { x } of apiR) {
  const k = apiAnahtar(x);
  const g = gozlem[k];
  if (x.sinif === "gercek") {
    // GET'i olan uc: catch-all'in 404'u DEGIL (oturumsuz → 401). GET'i
    // olmayan uc: 405 — Next yontem yoksa catch-all'a DUSMUYOR.
    iddia("7", `${k}|gercek-route-once-eslesir`, x.get ? !(g.durum === 404 && g.hata === CATCHALL) : g.durum === 405, `get=${x.get} ${JSON.stringify(g)}`);
  } else if (x.sinif === "musteri-host") {
    const o = gozlem["sinir|B-custom|/api/yok-boyle-uc"];
    iddia("7", `${k}|olmayan-yoldan-ayirt-edilemez`, g.durum === o.durum && g.tur === o.tur && g.hata === o.hata, `${JSON.stringify(g)} ≠ ${JSON.stringify(o)}`);
  } else {
    iddia("7", `${k}|catch-all-json-404`, g.durum === 404 && g.tur === "json" && g.hata === CATCHALL, JSON.stringify(g));
  }
}

// --- ortam: build kimligi
iddia("0", "ortam|sunucu build kimligi okundu", !!sunucuBuild, rscKok.govde.slice(0, 60));
if (yerelSunucu && yerelBuild) iddia("0", "ortam|sunucu = yerel .next/BUILD_ID (eski build'e karsi kosulmuyor)", sunucuBuild === yerelBuild, `sunucu=${sunucuBuild} yerel=${yerelBuild}`);

// ---------------------------------------------------------------------------
// Bilinen kusurlar (14.2.35) — katı xfail
// ---------------------------------------------------------------------------
// K1-K5 KAPANDI (21 Eylul 2026): matcher tam yola daraltildi (K1-K4),
// images.qualities: [75] (K5). Gecis: tahmin edilen 42 iddia "duzeldi"
// diye kirmiziya dondu, temel cizgi farki YALNIZ /apix hucrelerinde ve
// gorsel|q50'de cikti (29 hucre) — raporlar/2026-09-21-1435-k4-k5-matcher-duzeltmesi.md
//
// K6 KAPANDI (21 Eylul 2026): (a) `app/api/[...yol]/route.ts` → /api/ altinda
// olmayan yol JSON 404; (b) `x-tenant-slug` HIC yoksa kurum default'a degil
// NOTRE (get-tenant.ts `resolveCurrentTenant` → "no-header"). Gecis: tahmin
// edilen 2 iddia kirmiziya dondu, temel cizgi farki YALNIZ 5 sinir hucresinde
// (16 alan) + 23 yeni hucre — raporlar/2026-09-21-2050-k6-kimlik-sizintisi.md
const BILINEN_KUSURLAR = new Map([
  // K7 — K1'in dar kalintisi (21 Eylul 2026, K6 turunda olculdu): matcher
  //      disindaki HTML 404'te (K6'dan sonra yalniz /_next/static/<olmayan>)
  //      gelen `x-tenant-slug`'i ezen middleware yok → sahte baslik o kurumun
  //      kimligini gosterir. Canlida nginx basligi siliyor
  //      (deploy/nginx/snippets/sendika-uygulama.conf); bu iddialar UYGULAMA
  //      katmanini olcer. get-tenant.ts gelen basligi middleware'inkinden
  //      ayiramaz (oneri: raporlar/2026-09-21-2050-k6-kimlik-sizintisi.md).
  ["sinir-sahte|apex|/_next/static/yok.js|etkisiz", "K7"],
  ["sinir-sahte|B-custom|/_next/static/yok.js|etkisiz", "K7"],
]);
const KUSUR_ACIKLAMA = {
  K7: "matcher disindaki HTML 404'te (/_next/static/<olmayan>) sahte x-tenant-slug kabul ediliyor — canlida nginx siliyor",
};

// ---------------------------------------------------------------------------
// Temel cizgi
// ---------------------------------------------------------------------------
const surumSirala = (a, b) => {
  const pa = a.split(".").map(Number), pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
};
function temelSec() {
  if (process.env.IZOLASYON_TEMEL) return new URL(process.env.IZOLASYON_TEMEL, `file://${process.cwd().replace(/\\/g, "/")}/`);
  if (!existsSync(TEMEL_DIZIN)) return null;
  const surumler = readdirSync(TEMEL_DIZIN).map((f) => (f.match(/^next-(\d+\.\d+\.\d+)\.json$/) || [])[1]).filter(Boolean).sort(surumSirala);
  if (surumler.includes(NEXT_SURUM)) return new URL(`next-${NEXT_SURUM}.json`, TEMEL_DIZIN);
  const once = surumler.filter((s) => surumSirala(s, NEXT_SURUM) < 0).pop();
  return once ? new URL(`next-${once}.json`, TEMEL_DIZIN) : null;
}
function farklar(eski, yeni) {
  const out = [];
  const anahtarlar = [...new Set([...Object.keys(eski), ...Object.keys(yeni)])].sort();
  for (const k of anahtarlar) {
    if (!(k in eski)) { out.push(`+ YENI HUCRE   ${k}: ${JSON.stringify(yeni[k])}`); continue; }
    if (!(k in yeni)) { out.push(`- KAYIP HUCRE  ${k}: ${JSON.stringify(eski[k])}`); continue; }
    const alanlar = [...new Set([...Object.keys(eski[k]), ...Object.keys(yeni[k])])].sort();
    for (const a of alanlar) {
      const e = JSON.stringify(eski[k][a]), y = JSON.stringify(yeni[k][a]);
      if (e !== y) out.push(`~ ${k}.${a}: ${e} → ${y}`);
    }
  }
  return out;
}
const sirali = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));

// ---------------------------------------------------------------------------
// Rapor
// ---------------------------------------------------------------------------
const BOLUM_AD = {
  "0": "(0) ortam",
  "1": "(1) host × yol matrisi (html)",
  "2": "(2) ayni matris RSC + prefetch basliklariyla",
  "3": "(3) sahte baslik matrisi (x-tenant-slug, CSP, x-nonce)",
  "4": "(4) CSP uctan uca (her html yaniti)",
  "5": "(5) gorsel ucu sozlesmesi",
  "6": "(6) matcher siniri (iceride / disarida)",
  "7": "(7) /api catch-all (gercek route once, olmayan yol JSON 404)",
};
let gecti = 0, kaldi = 0;
const bilinenGorulen = new Map();
for (const bolum of Object.keys(BOLUM_AD)) {
  const bu = iddialar.filter((x) => x.bolum === bolum);
  let bg = 0, bk = 0, bb = 0;
  const satirlar = [];
  for (const x of bu) {
    const kusur = BILINEN_KUSURLAR.get(x.id);
    if (kusur && !x.ok) {
      bb++;
      bilinenGorulen.set(kusur, (bilinenGorulen.get(kusur) || 0) + 1);
      if (AYRINTI) satirlar.push(`  BILINEN [${kusur}] ${x.id}`);
    } else if (kusur && x.ok) {
      bk++; kaldi++;
      satirlar.push(`  FAIL  ${x.id} — BILINEN KUSUR ${kusur} ARTIK GORULMUYOR: duzeldiyse BILINEN_KUSURLAR'dan cikar`);
    } else if (x.ok) {
      bg++; gecti++;
      if (AYRINTI) satirlar.push(`  PASS  ${x.id}`);
    } else {
      bk++; kaldi++;
      satirlar.push(`  FAIL  ${x.id}${x.ayrinti ? `\n          ${x.ayrinti}` : ""}`);
    }
  }
  console.log(`\n--- ${BOLUM_AD[bolum]}: ${bg} gecti, ${bk} kaldi${bb ? `, ${bb} bilinen kusur` : ""}`);
  for (const s of satirlar) console.log(s);
}
// Katı xfail'in ikinci yarisi: listedeki bir iddia bu kosuda HIC URETILMEDIYSE
// (hucre degisti — ornegin HTML 404 duz metne dondu, CSP iddiasi dogmadi)
// kusur da "gorulmuyor" demektir → listeden cikarilmali.
const uretilen = new Set(iddialar.map((x) => x.id));
const uretilmeyen = [...BILINEN_KUSURLAR.keys()].filter((id) => !uretilen.has(id));
if (uretilmeyen.length) {
  console.log(`\n--- BILINEN KUSUR LISTESINDE OLUP ARTIK URETILMEYEN IDDIALAR: ${uretilmeyen.length}`);
  for (const id of uretilmeyen) {
    kaldi++;
    console.log(`  FAIL  ${id} — BILINEN KUSUR ${BILINEN_KUSURLAR.get(id)} ARTIK URETILMIYOR (hucre degisti): listeden cikar`);
  }
}
const kayipKusur = [...new Set(BILINEN_KUSURLAR.values())].filter((k) => !bilinenGorulen.has(k));

console.log("\n--- BILINEN KUSURLAR (14.2.35 — kirmizi yapmaz, HER kosuda listelenir)");
for (const [k, n] of [...bilinenGorulen].sort()) console.log(`  ${k} ×${n}: ${KUSUR_ACIKLAMA[k]}`);
if (kayipKusur.length) console.log(`  (listede olup bu kosuda hic gorulmeyen: ${kayipKusur.join(", ")})`);

const belge = {
  surum: NEXT_SURUM,
  kaydedildi: new Date().toISOString(),
  buildId: sunucuBuild,
  kurumlar: { A: A.slug, B: B.slug },
  hedefler: Object.fromEntries(Object.entries(HEDEF).map(([k, v]) => [k, v ? "var" : "YOK"])),
  bilinenKusurlar: Object.fromEntries([...bilinenGorulen].sort()),
  gozlem: sirali(gozlem),
};

let farkSayisi = 0;
console.log("\n--- TEMEL CIZGI");
if (KAYDET) {
  const hedef = new URL(`next-${NEXT_SURUM}.json`, TEMEL_DIZIN);
  if (kaldi > 0) {
    console.log(`  KAYDEDILMEDI: ${kaldi} kural FAIL varken temel cizgi yazilmaz.`);
  } else if (existsSync(hedef) && !UZERINE_YAZ) {
    console.log(`  KAYDEDILMEDI: ${hedef.pathname.split("/").slice(-2).join("/")} zaten var (--uzerine-yaz ile bilincli olarak ezilir).`);
    kaldi++;
  } else {
    mkdirSync(TEMEL_DIZIN, { recursive: true });
    writeFileSync(hedef, JSON.stringify(belge, null, 2) + "\n");
    console.log(`  KAYDEDILDI: scripts/izolasyon-temel/next-${NEXT_SURUM}.json (${Object.keys(gozlem).length} hucre)`);
  }
} else {
  const secilen = temelSec();
  if (!secilen || !existsSync(secilen)) {
    console.log("  TEMEL CIZGI YOK — once: npm run izolasyon:temel");
    kaldi++;
  } else {
    const eski = JSON.parse(readFileSync(secilen, "utf8"));
    const f = farklar(eski.gozlem, belge.gozlem);
    farkSayisi = f.length;
    console.log(`  karsilastirilan: ${secilen.pathname.split("/").pop()} (Next ${eski.surum}, ${eski.kaydedildi}) ↔ simdiki (Next ${NEXT_SURUM})`);
    if (f.length === 0) console.log(`  FARK YOK — ${Object.keys(belge.gozlem).length} hucrenin hepsi temel cizgiyle ayni`);
    else {
      console.log(`  🔴 ${f.length} FARK — her biri incelenmeli; kabul edilirse yeni surum icin temel cizgi kaydedilir:`);
      for (const s of f.slice(0, 200)) console.log(`    ${s}`);
      if (f.length > 200) console.log(`    … (${f.length - 200} fark daha)`);
    }
  }
}

console.log("");
console.log(`SONUC: ${gecti} gecti, ${kaldi + farkSayisi} kaldi (bilinen kusur: ${[...bilinenGorulen.values()].reduce((a, b) => a + b, 0)}, temel cizgi farki: ${farkSayisi})`);
console.log("");
process.exitCode = kaldi + farkSayisi === 0 ? 0 : 1;
