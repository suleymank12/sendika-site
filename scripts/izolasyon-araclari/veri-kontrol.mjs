/**
 * VERI KAYMASI KAPISI — izolasyon matrisinin hedef satirlarini okur ve
 * ozetinin sha256'sini yazar. Matris kosusundan hemen ONCE ve hemen SONRA
 * alinir; iki sha farkliysa kosu sirasinda canli veri degismistir ve sonuc
 * YORUMLANMAZ (DUR).
 *
 * KULLANIM:
 *   npm run izolasyon:veri -- <etiket> <cikti.json>
 *
 * Anon anahtar, yalniz okuma (uygulamanin kendisiyle ayni gorunurluk).
 *
 * 🔴 HEDEF SECIMI matrisinkiyle AYNI: ikisi de hedef-secimi.mjs'i kullanir
 * (sira, sinif filtresi, sabit B). IZOLASYON_TEMEL verilirse sabit B o
 * belgeden okunur — matrisin karsilastirdigi belgeyle ayni.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { hedefleriSec, listeleriOku, sabitBSec, temelSec } from "./hedef-secimi.mjs";

const REPO = new URL("../../", import.meta.url);
const env = { ...process.env };
const envYol = new URL(".env.local", REPO);
if (existsSync(envYol)) {
  for (const s of readFileSync(envYol, "utf8").split(/\r?\n/)) {
    const m = s.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].trim();
  }
}
if (process.argv.length < 4) {
  console.log("Kullanim: veri-kontrol.mjs <etiket> <cikti.json>");
  process.exit(2);
}
const q = async (p) => {
  const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/rest/v1/${p}`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
  });
  const j = await r.json();
  if (!Array.isArray(j)) throw new Error(`${p}: ${JSON.stringify(j)}`);
  return j;
};
const kurumlar = await q("tenants?select=id,slug,name,custom_domain,is_active,updated_at");
const A = kurumlar.find((k) => k.slug === "default");
const nextSurum = JSON.parse(readFileSync(new URL("node_modules/next/package.json", REPO), "utf8")).version;
const temelYol = temelSec(new URL("scripts/izolasyon-temel/", REPO), nextSurum, env);
const sabit = sabitBSec(kurumlar, temelYol && existsSync(temelYol) ? JSON.parse(readFileSync(temelYol, "utf8")) : null, null);
if (!A || sabit.hata) {
  console.log(`VERI KAPISI OKUNAMADI: ${!A ? "default kurumu yok" : sabit.hata}`);
  process.exit(1);
}
const B = sabit.B;
// Matrisle AYNI secim (hedef-secimi.mjs; sorgular updated_at'i da getirir)
const listeler = await listeleriOku(q);
const hedef = hedefleriSec(listeler, A, B);
const ozet = {};
for (const [ad, x] of Object.entries(hedef)) {
  if (!x) { ozet[ad] = null; continue; }
  const o = { id: x.id, slug: x.slug ?? null, updated_at: x.updated_at ?? null };
  if (ad.endsWith(".manset")) {
    Object.assign(o, { source_type: x.source_type, source_id: x.source_id, link_url: x.link_url, created_at: x.created_at });
    if (x.source_type === "news" && x.source_id) {
      const n = await q(`news?select=slug,updated_at,is_published&id=eq.${x.source_id}`);
      o.kaynak = n[0] ?? "KAYNAK-YOK/YAYINDA-DEGIL";
    } else if (x.source_type === "announcement" && x.source_id) {
      const n = await q(`announcements?select=slug,updated_at,is_published&id=eq.${x.source_id}`);
      o.kaynak = n[0] ?? "KAYNAK-YOK/YAYINDA-DEGIL";
    }
  }
  ozet[ad] = o;
}
ozet.kurumlar = { A: { id: A.id, slug: A.slug, name: A.name, updated_at: A.updated_at ?? null }, B: { id: B.id, slug: B.slug, name: B.name, custom_domain: B.custom_domain, updated_at: B.updated_at ?? null } };
ozet.sayilar = Object.fromEntries(Object.entries(listeler).map(([k, l]) => [k, l.length]));
// Mansetlerde updated_at yok: secilen satirin kendisi (sira/sinif alanlari) ozetin parcasi
ozet.mansetSirasi = listeler.manset.map((x) => `${x.id}/${x.order}/${x.source_type}/${x.source_id ?? ""}`);
const ayar = await q("site_settings?select=tenant_id,key,value&key=eq.site_title");
ozet.site_title = Object.fromEntries(ayar.filter((a) => [A.id, B.id].includes(a.tenant_id)).map((a) => [a.tenant_id === A.id ? "A" : "B", a.value]));
const ozetMetni = JSON.stringify(ozet);
const kayit = { etiket: process.argv[2], okundu: new Date().toISOString(), sha256: createHash("sha256").update(ozetMetni).digest("hex"), ozet };
writeFileSync(process.argv[3], JSON.stringify(kayit, null, 1));
console.log(`[${kayit.etiket}] ${kayit.okundu} · ozet sha256 ${kayit.sha256}`);
console.log(`  A.manset: ${ozet["A.manset"]?.source_type}/${ozet["A.manset"]?.kaynak?.slug} kaynak.updated_at=${ozet["A.manset"]?.kaynak?.updated_at}`);
console.log(`  A.haber:  ${ozet["A.haber"]?.slug} updated_at=${ozet["A.haber"]?.updated_at}`);
console.log(`  sayilar: ${JSON.stringify(ozet.sayilar)}`);
