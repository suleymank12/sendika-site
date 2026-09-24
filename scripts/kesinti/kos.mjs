/**
 * SUPABASE KESINTI TESTI — kalici ariza enjektoru (C0, 24 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:kesinti
 *   node scripts/kesinti/kos.mjs --beklenti <dosya.json> [--build-yok] [--birak]
 *                                [--yalniz <senaryo,...>] [--cikti <gozlem.json>]
 *
 * NE YAPAR:
 *   1. Calisma agacinin (git ls-files -co --exclude-standard: izlenen + izlenmeyen,
 *      yok sayilmayan) KOPYASINI repo DISINDA ayri bir dizine alir
 *      (varsayilan ../.sendika-kesinti-derleme, KESINTI_DIZIN ile degisir).
 *      node_modules repo'nunkine junction/symlink (AYNI SURUCU sart).
 *   2. Gercek .env.local'i YALNIZ OKUR; kopyada NEXT_PUBLIC_SUPABASE_URL =
 *      https://localhost yazar (NEXT_PUBLIC_ build aninda gomulur → ayri build).
 *      Ana .next ve gercek .env/.env.local DEGISMEZ.
 *   3. Gecici kendinden imzali sertifika (openssl) + 443'te vekil (vekil.mjs).
 *      🔴 Vekil GET/HEAD/OPTIONS disindaki her yontemi 403'ler: canliya YAZMA YOK.
 *   4. `next build` + `next start` (production) → beklenti dosyasindaki
 *      senaryolari node:http ile (Host basligi korunur) kosar, her adimi
 *      durum kodu + ust sure + govde isareti + baslik ile denetler.
 *
 * NE ZAMAN: izolasyon:tam gibi her kosuda DEGIL — kesinti dayanikliligi
 * turlarinda ve Next/Node/Supabase yukseltme turlarinda. Beklenti dosyasi
 * davranis degistiren commit'ten ONCE yazilir ve sha256 ile kilitlenir.
 *
 * Cikis: 0 = tum adimlar beklentiyle birebir, 1 = sapma, 2 = ortam/kullanim.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeSurumKapisi } from "../node-surum-kapisi.mjs";
import { vekilBaslat } from "./vekil.mjs";

nodeSurumKapisi("test:kesinti");

const REPO = fileURLToPath(new URL("../../", import.meta.url));
const argv = process.argv.slice(2);
const deger = (ad) => { const i = argv.indexOf(ad); return i >= 0 ? argv[i + 1] : undefined; };
const bayrak = (ad) => argv.includes(ad);
const beklentiYol = deger("--beklenti");
if (!beklentiYol || !existsSync(beklentiYol)) {
  console.log("Kullanim: kos.mjs --beklenti <dosya.json> [--build-yok] [--birak] [--yalniz a,b] [--cikti f.json]");
  process.exit(2);
}
const WIN = process.platform === "win32";
const DIZIN = path.resolve(process.env.KESINTI_DIZIN || path.join(REPO, "..", ".sendika-kesinti-derleme"));
const PORT = Number(process.env.KESINTI_PORT || 3300);
const VEKIL_PORT = 443;
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bekle = (ms) => new Promise((r) => setTimeout(r, ms));
const baslangic = Date.now();

async function cik(kod) {
  process.exitCode = kod;
  await bekle(50); // Windows: fetch/soket sonrasi ani exit libuv assertion'i (NOTE B4)
  process.exit(kod);
}
function ortamHatasi(mesaj) {
  console.log(`🔴 ORTAM: ${mesaj}`);
  return cik(2);
}

const beklentiHam = readFileSync(beklentiYol);
const beklenti = JSON.parse(beklentiHam);
console.log(`KESINTI TESTI — beklenti ${path.relative(REPO, path.resolve(beklentiYol))} (sha256 ${sha(beklentiHam)})`);
console.log(`  derleme dizini: ${DIZIN}  ·  next :${PORT}  ·  vekil :${VEKIL_PORT}`);

// ---------------------------------------------------------------------------
// Ortam: gercek env (YALNIZ OKUMA), kimlikler, portlar
// ---------------------------------------------------------------------------
const envYol = [".env.local", ".env"].map((f) => path.join(REPO, f)).find(existsSync);
if (!envYol) await ortamHatasi("repo'da .env.local / .env yok");
const envMetin = readFileSync(envYol, "utf8");
const envDeger = (ad) => (envMetin.match(new RegExp(`^${ad}=(.*)$`, "m")) || [])[1]?.trim();
const GERCEK_URL = envDeger("NEXT_PUBLIC_SUPABASE_URL");
const ANON = envDeger("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const KOK = envDeger("NEXT_PUBLIC_ROOT_DOMAIN");
if (!GERCEK_URL || !ANON || !KOK) await ortamHatasi("env'de NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / ROOT_DOMAIN eksik");
const envOnce = sha(readFileSync(envYol));

const temel = JSON.parse(readFileSync(path.join(REPO, "scripts/izolasyon-temel/next-14.2.35.json"), "utf8"));
const A = temel.kurumlar.A, B = temel.kurumlar.B, H = temel.hedefler;

const portBos = (port, host) => new Promise((ok) => {
  const s = net.createServer();
  s.once("error", (e) => ok(e.code));
  s.once("listening", () => s.close(() => ok(null)));
  s.listen({ port, host });
});
{
  const p = await portBos(PORT, "0.0.0.0");
  if (p) await ortamHatasi(`next portu ${PORT} kullanilamiyor (${p}). KESINTI_PORT ile degistirin ya da o sureci kapatin.`);
}

// ---------------------------------------------------------------------------
// Derleme dizini (repo disi) — junction guvenligi
// ---------------------------------------------------------------------------
const NM = path.join(DIZIN, "node_modules");
function baglantiyiKaldir() {
  let st;
  try { st = lstatSync(NM); } catch { return; }
  if (WIN) spawnSync("cmd", ["/c", "rmdir", NM], { stdio: "ignore" });
  else if (st.isSymbolicLink()) unlinkSync(NM);
  if (existsSync(NM)) throw new Error(`node_modules baglantisi kaldirilamadi: ${NM} — DIZIN SILINMEDI`);
  if (!existsSync(path.join(REPO, "node_modules", "next", "package.json"))) throw new Error("🔴 repo node_modules'u kayboldu!");
}
function dizinTemizle() {
  if (!existsSync(DIZIN)) return;
  baglantiyiKaldir();
  rmSync(DIZIN, { recursive: true, force: true });
}

const sertifika = { key: path.join(DIZIN, "sertifika", "key.pem"), cert: path.join(DIZIN, "sertifika", "cert.pem") };
function derlemeHazirla() {
  dizinTemizle();
  mkdirSync(DIZIN, { recursive: true });
  const ls = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 << 20 });
  if (ls.status !== 0) throw new Error("git ls-files basarisiz");
  let n = 0;
  for (const f of ls.stdout.split("\0").filter(Boolean)) {
    const kaynak = path.join(REPO, f);
    if (!existsSync(kaynak) || lstatSync(kaynak).isDirectory()) continue; // silinmis izlenen dosya
    const hedef = path.join(DIZIN, f);
    mkdirSync(path.dirname(hedef), { recursive: true });
    copyFileSync(kaynak, hedef);
    n++;
  }
  const yeniEnv = envMetin.replace(/^NEXT_PUBLIC_SUPABASE_URL=.*$/m, "NEXT_PUBLIC_SUPABASE_URL=https://localhost");
  writeFileSync(path.join(DIZIN, ".env.local"), yeniEnv);
  if (WIN) {
    const r = spawnSync("cmd", ["/c", "mklink", "/J", NM, path.join(REPO, "node_modules")], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`junction kurulamadi (ayni surucu mu?): ${r.stdout}${r.stderr}`);
  } else {
    symlinkSync(path.join(REPO, "node_modules"), NM, "dir");
  }
  return n;
}
function sertifikaUret() {
  mkdirSync(path.dirname(sertifika.key), { recursive: true });
  const cfg = path.join(path.dirname(sertifika.key), "openssl.cnf");
  writeFileSync(cfg, "[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1\n");
  const r = spawnSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", sertifika.key, "-out", sertifika.cert, "-days", "2", "-config", cfg], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`openssl ile sertifika uretilemedi (openssl PATH'te mi?): ${r.stderr || r.error}`);
}

/** Ayri build'in sunucu paketlerinde gercek Supabase host'u var mi (olmamali). */
function gomuluVarMi(dizin, host) {
  for (const ad of readdirSync(dizin, { withFileTypes: true })) {
    const p = path.join(dizin, ad.name);
    if (ad.isDirectory()) { if (gomuluVarMi(p, host)) return true; }
    else if (/\.(js|json)$/.test(ad.name) && readFileSync(p, "utf8").includes(host)) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Next sureci
// ---------------------------------------------------------------------------
const NEXT_BIN = () => path.join(DIZIN, "node_modules", "next", "dist", "bin", "next");
const LOG = path.join(DIZIN, "next.log");
let sunucu = null;
async function sunucuBaslat() {
  sunucu = spawn(process.execPath, [NEXT_BIN(), "start", "-p", String(PORT)], {
    cwd: DIZIN, env: { ...process.env, NODE_EXTRA_CA_CERTS: sertifika.cert }, detached: !WIN, stdio: ["ignore", "pipe", "pipe"],
  });
  sunucu.stdout.on("data", (d) => appendFileSync(LOG, d));
  sunucu.stderr.on("data", (d) => appendFileSync(LOG, d));
  for (let i = 0; i < 120; i++) {
    const hazir = await new Promise((ok) => {
      const q = http.get({ host: "127.0.0.1", port: PORT, path: "/favicon.ico", timeout: 2000 }, (r) => { r.resume(); ok(true); });
      q.on("error", () => ok(false)); q.on("timeout", () => { q.destroy(); ok(false); });
    });
    if (hazir) return;
    await bekle(500);
  }
  throw new Error("next start 60 sn icinde hazir olmadi (next.log)");
}
async function sogukBaslat() {
  await sunucuDurdur();
  rmSync(path.join(DIZIN, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  await sunucuBaslat();
}
async function sunucuDurdur() {
  if (!sunucu) return;
  const pid = sunucu.pid;
  if (WIN) spawnSync("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore" });
  else { try { process.kill(-pid, "SIGKILL"); } catch { /* zaten yok */ } }
  sunucu = null;
  for (let i = 0; i < 40 && (await portBos(PORT, "0.0.0.0")); i++) await bekle(250);
}

// ---------------------------------------------------------------------------
// Istek + sahte oturum cerezi
// ---------------------------------------------------------------------------
const b64u = (s) => Buffer.from(s).toString("base64url");
const CEREZ_ADI = "sb-localhost-auth-token";
function sahteCerez(expOffsetSn) {
  const exp = Math.floor(Date.now() / 1000) + expOffsetSn;
  const sub = "11111111-1111-4111-8111-111111111111";
  const jwt = [b64u('{"alg":"HS256","typ":"JWT"}'), b64u(JSON.stringify({ sub, exp, role: "authenticated", aud: "authenticated", session_id: "22222222-2222-4222-8222-222222222222" })), "c2FodGU"].join(".");
  const oturum = { access_token: jwt, token_type: "bearer", expires_in: 3600, expires_at: exp, refresh_token: "sahteyenileme", user: { id: sub, aud: "authenticated", role: "authenticated", email: "sahte@ornek.invalid" } };
  return `${CEREZ_ADI}=base64-${b64u(JSON.stringify(oturum))}`;
}

let GORSEL = null; // pass modunda ogrenilir
function yerlestir(s) {
  return s
    .replaceAll("{kok}", KOK).replaceAll("{sa}", `superadminpanel.${KOK}`)
    .replaceAll("{B.sub}", `${B.slug}.${KOK}`).replaceAll("{B.custom}", B.custom_domain)
    .replaceAll("{B.id}", B.id).replaceAll("{A.id}", A.id)
    .replaceAll("{A.haber}", H["A.haber"].slug).replaceAll("{A.sayfa}", H["A.sayfa"].slug)
    .replace(/\{gorsel:(\d+)\}/g, (_, w) => `/_next/image?url=${encodeURIComponent(GORSEL)}&w=${w}&q=75`);
}

function istek({ host, yol, cerez, accept, limitMs = 200_000 }) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const headers = { host: `${host}:${PORT}`, accept: accept || "text/html" };
    if (cerez === "taze") headers.cookie = sahteCerez(3600);
    if (cerez === "sure") headers.cookie = sahteCerez(-120);
    const req = http.request({ host: "127.0.0.1", port: PORT, path: yol, headers }, (res) => {
      const parcalar = [];
      res.on("data", (d) => parcalar.push(d));
      res.on("end", () => resolve({
        durum: res.statusCode,
        ms: Math.round(performance.now() - t0),
        govde: Buffer.concat(parcalar).toString("utf8"),
        basliklar: res.headers,
      }));
    });
    req.setTimeout(limitMs, () => req.destroy(new Error("istemci-zaman-asimi")));
    req.on("error", (e) => resolve({ durum: `HATA:${e.message}`, ms: Math.round(performance.now() - t0), govde: "", basliklar: {} }));
    req.end();
  });
}

function upstreamGet(yol) {
  return new Promise((ok, hata) => {
    https.get({ host: "localhost", port: VEKIL_PORT, path: yol, ca: readFileSync(sertifika.cert), headers: { apikey: ANON, authorization: `Bearer ${ANON}` } }, (r) => {
      let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => ok({ durum: r.statusCode, govde: b }));
    }).on("error", hata);
  });
}

// ---------------------------------------------------------------------------
// Denetim
// ---------------------------------------------------------------------------
const esles = (desen, metin) => {
  const d = yerlestir(desen);
  return d.startsWith("re:") ? new RegExp(d.slice(3)).test(metin) : metin.includes(d);
};
function denetle(g, b) {
  const hatalar = [];
  if (b.durum !== undefined && g.durum !== b.durum) hatalar.push(`durum ${g.durum} ≠ ${b.durum}`);
  if (b.ustMs !== undefined && g.ms > b.ustMs) hatalar.push(`sure ${g.ms} > ${b.ustMs} ms`);
  if (b.altMs !== undefined && g.ms < b.altMs) hatalar.push(`sure ${g.ms} < ${b.altMs} ms`);
  for (const d of b.icerir || []) if (!esles(d, g.govde)) hatalar.push(`govdede YOK: ${d}`);
  for (const d of b.icermez || []) if (esles(d, g.govde)) hatalar.push(`govdede VAR: ${d}`);
  if (b.konum !== undefined) {
    const k = (g.basliklar.location || "").replace(/^https?:\/\/[^/]+/, "");
    if (b.konum === null ? k !== "" : !esles(b.konum, k)) hatalar.push(`konum "${k}" ≠ ${b.konum}`);
  }
  for (const [ad, d] of Object.entries(b.basliklar || {})) {
    const v = g.basliklar[ad];
    if (d === null ? v !== undefined : v === undefined || !esles(d, String(v))) hatalar.push(`baslik ${ad}="${v ?? ""}" ≠ ${d}`);
  }
  // Vekilde kara delige dusen TCP baglantisi sayisi = sirali upstream bekleme
  // sayisinin kaniti (ör. hata render'inda kurumun ikinci kez sorulmasi).
  if (b.karadelikBaglanti !== undefined && g.karadelik !== b.karadelikBaglanti) hatalar.push(`kara delik baglantisi ${g.karadelik} ≠ ${b.karadelikBaglanti}`);
  if (b.cerezSil !== undefined) {
    const sil = (g.basliklar["set-cookie"] || []).some((c) => c.startsWith(CEREZ_ADI) && /max-age=0/i.test(c));
    if (sil !== b.cerezSil) hatalar.push(`cerez silme ${sil} ≠ ${b.cerezSil}`);
  }
  return hatalar;
}

// ---------------------------------------------------------------------------
// Kosu
// ---------------------------------------------------------------------------
let vekil;

// ---------------------------------------------------------------------------
// Tarayici adimi (C2+C7 v2, kullanici karari): Next 14'te "shell" hatasinda
// notr hata siniri SUNUCU HTML'inde degil, hidrasyondan sonra TARAYICIDA
// cizilir (olculdu). Sunucu tarafi `__next_error__` kabugunu + sizintisizligi
// denetler; bu adim gorunen metni ve sinir degerini. playwright-core
// (devDependency, 1.63.0 → Playwright'in kurdugu Chromium 1243) yuklenemez ya
// da tarayici baslayamazsa adim ORTAM der ve KALIR — sessizce gecmez.
// ---------------------------------------------------------------------------
let tarayici = null;
async function tarayiciDenetle(host, yol, b) {
  const hatalar = [];
  try {
    if (!tarayici) {
      const { chromium } = await import("playwright-core");
      tarayici = await chromium.launch({ args: ["--host-resolver-rules=MAP * 127.0.0.1"] });
    }
  } catch (e) {
    return [`ORTAM: tarayici baslatilamadi (${String(e.message || e).split("\n")[0]})`];
  }
  const sayfa = await tarayici.newPage();
  try {
    const t0 = performance.now();
    const yanit = await sayfa.goto(`http://${host}:${PORT}${yol}`, { waitUntil: "load", timeout: 120_000 });
    await sayfa.waitForSelector("[data-sinir]", { timeout: 20_000 }).catch(() => {});
    const g = await sayfa.evaluate(() => ({
      sinir: [...document.querySelectorAll("[data-sinir]")].map((e) => e.getAttribute("data-sinir")),
      metin: document.body.innerText.trim(),
      html: document.documentElement.outerHTML,
    }));
    if (b.durum !== undefined && yanit?.status() !== b.durum) hatalar.push(`tarayici durum ${yanit?.status()} ≠ ${b.durum}`);
    if (b.sinir !== undefined && JSON.stringify(g.sinir) !== JSON.stringify([b.sinir])) hatalar.push(`tarayici data-sinir ${JSON.stringify(g.sinir)} ≠ ["${b.sinir}"]`);
    if (b.gorunenMetin !== undefined && !g.metin.startsWith(b.gorunenMetin)) hatalar.push(`tarayici gorunen metin "${g.metin.slice(0, 80)}" ≠ "${b.gorunenMetin}"`);
    for (const d of b.icermez || []) if (esles(d, g.html)) hatalar.push(`tarayici DOM'da VAR: ${d}`);
    if (b.ustMs !== undefined && performance.now() - t0 > b.ustMs) hatalar.push(`tarayici sure > ${b.ustMs} ms`);
  } catch (e) {
    hatalar.push(`tarayici hatasi: ${String(e.message || e).split("\n")[0]}`);
  } finally {
    await sayfa.close().catch(() => {});
  }
  return hatalar;
}
const gozlem = [];
let kaldi = 0, gecti = 0;
try {
  if (!bayrak("--build-yok") || !existsSync(path.join(DIZIN, ".next", "BUILD_ID"))) {
    const n = derlemeHazirla();
    sertifikaUret();
    console.log(`  kopya: ${n} dosya → build basliyor…`);
  } else if (!existsSync(sertifika.cert)) sertifikaUret();

  vekil = vekilBaslat({ port: VEKIL_PORT, key: readFileSync(sertifika.key), cert: readFileSync(sertifika.cert), gercekUrl: GERCEK_URL });
  try { await vekil.baslat(); } catch (e) {
    const neden = e.code === "EADDRINUSE" ? `443 DOLU — baska bir surec dinliyor (Windows: netstat -ano | findstr :443). Kapatip tekrar deneyin.`
      : e.code === "EACCES" ? "443'e baglanma izni yok (Linux'ta root ya da cap_net_bind_service gerekir)." : String(e);
    throw Object.assign(new Error(neden), { ortam: true });
  }

  if (!bayrak("--build-yok") || !existsSync(path.join(DIZIN, ".next", "BUILD_ID"))) {
    const t = Date.now();
    const b = spawnSync(process.execPath, [NEXT_BIN(), "build"], { cwd: DIZIN, env: { ...process.env, NODE_EXTRA_CA_CERTS: sertifika.cert }, encoding: "utf8", maxBuffer: 64 << 20 });
    writeFileSync(path.join(DIZIN, "build.log"), (b.stdout || "") + (b.stderr || ""));
    if (b.status !== 0) throw Object.assign(new Error(`build basarisiz (${path.join(DIZIN, "build.log")})`), { ortam: true });
    if (gomuluVarMi(path.join(DIZIN, ".next", "server"), new URL(GERCEK_URL).hostname)) throw Object.assign(new Error("build'de GERCEK Supabase host'u gomulu — ayri build basarisiz"), { ortam: true });
    console.log(`  build: ${Math.round((Date.now() - t) / 1000)} sn`);
  }
  rmSync(path.join(DIZIN, ".next", "cache", "fetch-cache"), { recursive: true, force: true });
  rmSync(path.join(DIZIN, ".next", "cache", "images"), { recursive: true, force: true });
  await sunucuBaslat();

  // Gorsel: A'nin yayindaki bir haber kapagi (pass)
  const g = await upstreamGet(`/rest/v1/news?select=cover_image&tenant_id=eq.${A.id}&is_published=eq.true&cover_image=not.is.null&order=id.asc&limit=1`);
  const kapak = g.durum === 200 ? JSON.parse(g.govde)[0]?.cover_image : null;
  if (!kapak || !/\/storage\/v1\/object\/public\//.test(kapak)) throw Object.assign(new Error("A kurumunda kapak gorselli yayinda haber bulunamadi (gorsel senaryolari kurulamaz)"), { ortam: true });
  GORSEL = "https://localhost" + new URL(kapak).pathname;

  const yalniz = deger("--yalniz") ? new Set(deger("--yalniz").split(",")) : null;
  console.log("");
  console.log("senaryo/adim".padEnd(40) + "mod".padEnd(11) + "durum".padEnd(7) + "sure(ms)".padStart(9) + "  ust".padEnd(8) + "  hukum");
  for (const sn of beklenti.senaryolar) {
    if (yalniz && !yalniz.has(sn.id)) continue;
    if (sn.yenidenBaslat) await sogukBaslat();
    for (const a of sn.adimlar) {
      const host = yerlestir(a.host);
      // Adim duzeyinde yeniden baslatma: kurum onbellegi YASI 0'dan baslar.
      // Olculdu (C0 ilk kosu): isitma bayat girdiyi yeniler ama taze girdiyi
      // yenilemez; 60 sn TTL'e yakin bir girdi 21 sn'lik kara delik istegi
      // sirasinda bayatlayip zehirlenebiliyor → "taze" varsayimi zamanlamaya
      // bagli kaliyordu. Belirlenimci "taze" icin sunucu sifirdan baslar.
      if (a.yenidenBaslat) await sogukBaslat();
      if (a.isit) {
        await vekil.mod("pass");
        await istek({ host, yol: host.startsWith("superadminpanel.") ? "/super-admin/giris" : "/" });
      }
      if (a.bekleOnceMs) await bekle(a.bekleOnceMs);
      await vekil.mod(a.mod || "pass", { gecikmeMs: a.gecikmeMs, authKota: a.authKota, rpcCevap: a.rpcCevap });
      const once = vekil.seq();
      const sonuc = await istek({ host, yol: yerlestir(a.yol), cerez: a.cerez, accept: a.accept });
      await bekle(400);
      const olay = vekil.kayit(once);
      // Tani: KESINTI_GOVDE_DIZIN verilirse her adimin govdesi dosyaya yazilir (denetimi etkilemez).
      if (process.env.KESINTI_GOVDE_DIZIN) {
        mkdirSync(process.env.KESINTI_GOVDE_DIZIN, { recursive: true });
        writeFileSync(path.join(process.env.KESINTI_GOVDE_DIZIN, `${sn.id}__${a.id}.html`.replace(/[/:+]/g, "_")), sonuc.govde);
      }
      const hatalar = denetle({ ...sonuc, karadelik: olay.filter((e) => e.ev === "tcp-karadelik").length }, a.beklenen);
      if (a.tarayici) hatalar.push(...(await tarayiciDenetle(host, yerlestir(a.yol), a.tarayici)));
      hatalar.length ? kaldi++ : gecti++;
      const satir = {
        senaryo: sn.id, adim: a.id, mod: a.mod || "pass", durum: sonuc.durum, ms: sonuc.ms,
        konum: (sonuc.basliklar.location || "").replace(/^https?:\/\/[^/]+/, "") || null,
        retryAfter: sonuc.basliklar["retry-after"] || null, cacheControl: sonuc.basliklar["cache-control"] || null,
        ust: olay.filter((e) => e.ev === "istek").map((e) => `${e.yontem} ${e.yol}`),
        karadelik: olay.filter((e) => e.ev === "tcp-karadelik").length,
        hatalar,
      };
      gozlem.push(satir);
      console.log(`${(sn.id + "/" + a.id).padEnd(40)}${satir.mod.padEnd(11)}${String(sonuc.durum).padEnd(7)}${String(sonuc.ms).padStart(9)}  ${String(a.beklenen.ustMs ?? "-").padEnd(6)}  ${hatalar.length ? "FAIL — " + hatalar.join("; ") : "ok"}`);
    }
  }
  await vekil.mod("pass");
} catch (e) {
  console.log(`🔴 ${e.ortam ? "ORTAM" : "HATA"}: ${e.message}`);
  if (!e.ortam) console.log(e.stack);
  kaldi = kaldi || -1;
} finally {
  if (tarayici) await tarayici.close().catch(() => {});
  await sunucuDurdur();
  if (vekil) await vekil.kapat();
  if (sha(readFileSync(envYol)) !== envOnce) console.log("🔴 GERCEK ENV DOSYASI DEGISTI — olmamaliydi!");
  if (deger("--cikti")) writeFileSync(deger("--cikti"), JSON.stringify(gozlem, null, 2));
  if (!bayrak("--birak")) dizinTemizle();
}
const sure = Math.round((Date.now() - baslangic) / 1000);
if (kaldi < 0) {
  console.log(`SONUC: ORTAM/HATA — kosu tamamlanmadi (${sure} sn)`);
  await cik(2);
}
console.log(`SONUC: ${gecti} adim gecti, ${kaldi} kaldi (${sure} sn)`);
await cik(kaldi ? 1 : 0);
