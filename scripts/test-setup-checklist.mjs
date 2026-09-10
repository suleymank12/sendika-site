/**
 * Kurulum Durumu (yeni kurum kurulum kontrol listesi) testi — 11 Eylül 2026.
 *
 * CALISTIRMA:
 *   npm run test:setup
 *   (= node scripts/test-setup-checklist.mjs)
 *
 * BAGLAM:
 *   Yeni musteri kurulumunun kod disi adimlari (DNS, Nginx, SSL, Supabase
 *   Redirect URLs) unutuluyordu — Kurmay'da Redirect URLs satiri atlanmis,
 *   custom domain'de sifre sifirlama sessizce calismiyordu. Artik tenants/[id]
 *   sayfasinda her acilista CANLI olculen "Kurulum Durumu" var.
 *
 * BU TEST NEYI DOGRULAR:
 *   (a) hazir metinler — Supabase 2 satir (apex zorunlu + www savunma), DNS,
 *       certbot, Nginx (apex blogunda www YOK, ayri 301 blogu), komut sirasi
 *   (b) custom domain degisim penceresi icerigi
 *   (c) yoklama sonucu → durum cevirimi (uygulama yaniti, yonlendirme,
 *       Supabase, DNS, sertifika) — fikstürler 11 Eylul CANLI olcumunden
 *   (d) evaluateSetup — tum liste, sayaclar, ozet
 *   (e) runSetupProbes — sahte DNS/TLS/fetch ile: DNS kapisi, ozel IP
 *       korumasi, yerel gelistirme, Supabase URL'i, hic firlatmama
 *   (f) IP / hata kodu yardimcilari
 *   (g) kod tutarliligi — route yolu, middleware sabitleri, sifirlama donus
 *       yolu, update-tenant cevabi
 *
 * ⚠️ KAPSAM SINIRI (bilincli): route CALISTIRILMAZ (repoda HTTP kosucusu yok);
 *   gercek ag yoklamasi yok. Sahte olan yalniz ag bagimliliklari; mantik
 *   gercek kaynaktan import edilir. Canli davranis: NOTE.md manuel test tablosu.
 *
 * .ts dosyalari Node 22.18+/23+ tarafindan dogrudan calistirilir (type stripping).
 */

import { existsSync, readFileSync } from "node:fs";
import {
  AUTH_RETURN_PATH,
  SETUP_CHECK_API_PATH,
  TENANT_ERROR_PATH,
  buildCertbotText,
  buildDnsRecordsText,
  buildDomainChangeNotice,
  buildNginxCommandsText,
  buildNginxConfig,
  buildServerCleanupText,
  buildSnippets,
  buildSupabaseLines,
  buildSupabaseWildcardLine,
  combineVerdicts,
  daysUntil,
  evaluateAppResponse,
  evaluateCert,
  evaluateDns,
  evaluateRedirect,
  evaluateSetup,
  evaluateSupabaseProbe,
  formatAgo,
  formatTrDate,
  summarizeSetup,
} from "../src/lib/super-admin/setup-checklist.ts";
import {
  PROBE_INVALID_TOKEN,
  PROBE_PAGE_PATH,
  SUPABASE_RETURN_PATH,
  buildSupabaseProbeUrl,
  gateHost,
  isLocalRootDomain,
  isPublicIPv4,
  isPublicIPv6,
  probeErrorCode,
  runSetupProbes,
} from "../src/lib/super-admin/setup-probes.ts";

// ---------------------------------------------------------------------------
// Kucuk test kosucusu (diger test script'leriyle ayni desen)
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

function ok(group, name, actual, expected, input) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  PASS  [${group}] ${name}`);
  } else {
    failures.push({ group, name });
    console.log(`  FAIL  [${group}] ${name}`);
    console.log(`          girdi : ${input}`);
    console.log(`          cikti : ${a}`);
    console.log(`          bekle : ${e}`);
  }
}

function okTrue(group, name, cond, input) {
  ok(group, name, cond === true, true, input);
}

function header(title) {
  console.log("");
  console.log(title);
  console.log("");
}

// ---------------------------------------------------------------------------
// Fikstürler — 11 Eylul 2026 CANLI olcumu (kurmayteknoloji.com)
// ---------------------------------------------------------------------------
const DOMAIN = "kurmayteknoloji.com";
const WWW = `www.${DOMAIN}`;
const ROOT = "buyukdirilis.org.tr";
const SLUG = "kurmay-teknoloji";
const SUB = `${SLUG}.${ROOT}`;
const SERVER_IP = "185.33.234.67";
const SUPABASE_URL = "https://jqwmexample.supabase.co";
const NOW = Date.UTC(2026, 8, 11, 9, 0, 0); // 11 Eylul 2026 12:00 (TR)

const SUPA_OK_LOCATION = `https://${DOMAIN}/admin/davet-kabul#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=`;
const SUPA_SUB_OK_LOCATION = `https://${SUB}/admin/davet-kabul#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=`;
const SUPA_MISSING_LOCATION = `https://${ROOT}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired&sb=`;
const CERT_KURMAY = "2026-12-07T07:12:34.000Z";
const CERT_WILDCARD = "2026-11-24T15:29:44.000Z";

const dnsOk = (...addresses) => ({ ok: true, addresses });
const httpOk = (status, location = null, tenantSlug = null) => ({ ok: true, status, location, tenantSlug });
const tlsOk = (validTo, authorized = true, authorizationError = null) => ({
  ok: true,
  authorized,
  authorizationError,
  validTo,
});

/** Canli olcumdeki Kurmay raporu (www 200 — 301 YOK). */
function kurmayReport(over = {}) {
  return {
    checkedAt: new Date(NOW).toISOString(),
    rootDomain: ROOT,
    localDev: false,
    server: { ipv4: dnsOk(SERVER_IP), ipv6: dnsOk() },
    subdomain: {
      host: SUB,
      dns: dnsOk(SERVER_IP),
      http: httpOk(200, null, SLUG),
      tls: tlsOk(CERT_WILDCARD),
      supabase: httpOk(303, SUPA_SUB_OK_LOCATION),
    },
    domain: {
      domain: DOMAIN,
      dns: { apex4: dnsOk(SERVER_IP), www4: dnsOk(SERVER_IP), apex6: dnsOk(), www6: dnsOk() },
      tlsApex: tlsOk(CERT_KURMAY),
      tlsWww: tlsOk(CERT_KURMAY),
      httpsApex: httpOk(200, null, SLUG),
      httpsWww: httpOk(200, null, SLUG),
      httpApex: httpOk(301, `https://${DOMAIN}/`),
      supabase: httpOk(303, SUPA_OK_LOCATION),
      ...over,
    },
  };
}

function snapshot(over = {}) {
  return {
    tenant: {
      id: "11111111-1111-4111-8111-111111111111",
      slug: SLUG,
      name: "Kurmay Teknoloji",
      customDomain: DOMAIN,
      isActive: true,
      ...(over.tenant ?? {}),
    },
    rootDomain: ROOT,
    admins:
      "admins" in over
        ? over.admins
        : [{ email: "admin@kurmay.com", invitedAt: "2026-09-01T10:00:00Z", lastSignInAt: "2026-09-02T10:00:00Z" }],
    settings:
      "settings" in over
        ? over.settings
        : { logo_url: "https://x.supabase.co/storage/v1/object/public/images/t/logo.png", contact_phone: "0212", contact_address: "İstanbul" },
    counts: { categories: 3, menuItems: 5, homepageSections: 4, ...(over.counts ?? {}) },
  };
}

function findItem(ev, id) {
  for (const g of ev.groups) for (const i of g.items) if (i.id === id) return i;
  return null;
}

function statusOf(ev, id) {
  return findItem(ev, id)?.status ?? "(yok)";
}

/** Nginx metnini server bloklarina ayirir (ic ice blok sayar). */
function serverBlocks(conf) {
  const blocks = [];
  const lines = conf.split("\n");
  let depth = 0;
  let current = null;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("#")) continue;
    if (depth === 0 && t === "server {") {
      current = [];
      depth = 1;
      continue;
    }
    if (current) {
      if (t.endsWith("{")) depth++;
      if (t === "}") depth--;
      if (depth === 0) {
        blocks.push(current.join("\n"));
        current = null;
        continue;
      }
      current.push(t);
    }
  }
  return blocks;
}

function serverNames(block) {
  const m = block.split("\n").find((l) => l.startsWith("server_name "));
  return m ? m.slice("server_name ".length).replace(/;$/, "").split(/ +/) : [];
}

// ---------------------------------------------------------------------------
header("(a) Hazir metinler");

{
  const lines = buildSupabaseLines(DOMAIN);
  ok("supabase", "tam 2 satir: apex (zorunlu) + www (savunma)", lines, [
    "https://kurmayteknoloji.com/admin/davet-kabul*",
    "https://www.kurmayteknoloji.com/admin/davet-kabul*",
  ], DOMAIN);
  okTrue("supabase", "hepsi https:// (http satiri YOK)", lines.every((l) => l.startsWith("https://")), lines.join(" "));
  okTrue("supabase", "hepsi * ile biter", lines.every((l) => l.endsWith("*")), lines.join(" "));
  ok("supabase", "wildcard platform satiri", buildSupabaseWildcardLine(ROOT), "https://*.buyukdirilis.org.tr/admin/davet-kabul*", ROOT);
}

{
  const t = buildDnsRecordsText(SERVER_IP);
  okTrue("dns", "apex A kaydi", t.includes(`A     @     ${SERVER_IP}`), t);
  okTrue("dns", "www A kaydi", t.includes(`A     www   ${SERVER_IP}`), t);
  okTrue("dns", "IP bilinmiyorsa yer tutucu", buildDnsRecordsText(null).includes("<sunucu IP'si>"), "null");
}

{
  const t = buildCertbotText(DOMAIN);
  okTrue("certbot", "certonly --nginx, apex + www", t.includes("certbot certonly --nginx -d kurmayteknoloji.com -d www.kurmayteknoloji.com"), t);
  okTrue("certbot", "yenileme sinamasi", t.includes("certbot renew --dry-run --cert-name kurmayteknoloji.com"), t);
}

{
  const conf = buildNginxConfig(DOMAIN);
  const blocks = serverBlocks(conf);
  ok("nginx", "3 server blogu", blocks.length, 3, "conf");
  const [apex, www, http] = blocks;
  ok("nginx", "(1) apex blogu server_name YALNIZ apex (www YOK)", serverNames(apex), [DOMAIN], apex.split("\n")[1]);
  okTrue("nginx", "(1) 443 ssl", apex.includes("listen 443 ssl;"), "apex");
  okTrue("nginx", "(1) proxy_pass 127.0.0.1:3000 (static + /)", apex.split("proxy_pass http://127.0.0.1:3000;").length - 1 === 2, "apex");
  okTrue("nginx", "(1) Host $host + X-Forwarded-Proto $scheme", apex.includes("proxy_set_header Host $host;") && apex.includes("proxy_set_header X-Forwarded-Proto $scheme;"), "apex");
  okTrue("nginx", "(1) canli bloktaki ayarlar korunur (450M, immutable, upgrade)", apex.includes("client_max_body_size 450M;") && apex.includes("immutable") && apex.includes("proxy_set_header Connection 'upgrade';"), "apex");
  okTrue("nginx", "(1) sertifika yolu apex adina", apex.includes("ssl_certificate     /etc/letsencrypt/live/kurmayteknoloji.com/fullchain.pem;"), "apex");
  ok("nginx", "(2) www blogu server_name YALNIZ www", serverNames(www), [WWW], "www");
  okTrue("nginx", "(2) www → apex 301 ($request_uri korunur)", www.includes("return 301 https://kurmayteknoloji.com$request_uri;"), "www");
  okTrue("nginx", "(2) www blogu da ayni sertifikayla 443", www.includes("listen 443 ssl;") && www.includes("/etc/letsencrypt/live/kurmayteknoloji.com/privkey.pem;"), "www");
  okTrue("nginx", "(2) www blogu uygulamaya GITMEZ (proxy_pass yok)", !www.includes("proxy_pass"), "www");
  ok("nginx", "(3) http blogu apex + www", serverNames(http), [DOMAIN, WWW], "http");
  okTrue("nginx", "(3) 80 → https apex", http.includes("listen 80;") && http.includes("return 301 https://kurmayteknoloji.com$request_uri;"), "http");
  const httpsNames = [apex, www].flatMap(serverNames);
  ok("nginx", "443'te her ad TEK blokta (catisan server_name yok)", httpsNames.length, new Set(httpsNames).size, httpsNames.join(" "));
  ok("nginx", "suslu parantezler dengeli", conf.split("{").length, conf.split("}").length, "conf");
}

{
  const t = buildNginxCommandsText(DOMAIN);
  okTrue("nginx-komut", "grep -R (symlink izler; -r izlemez)", t.includes('grep -Rn "kurmayteknoloji.com" /etc/nginx/sites-enabled/'), t);
  const order = ["nano /etc/nginx/sites-available/kurmayteknoloji.com", "ln -s", "grep -Rn", "nginx -t && systemctl reload nginx"].map((k) => t.indexOf(k));
  okTrue("nginx-komut", "sira: dosya → etkinlestir → eski bloklar → sina+yukle", order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
}

{
  const s = buildSnippets(snapshot(), SERVER_IP);
  okTrue("snippet", "custom domain varken tum metinler dolu", Object.values(s).every((v) => v !== null), Object.keys(s).join(","));
  ok("snippet", "Supabase satir satir kopyalanir", s.supabase.perLine, true, "supabase");
  ok("snippet", "Supabase metni = 2 satir", s.supabase.text.split("\n"), buildSupabaseLines(DOMAIN), "supabase");
  okTrue("snippet", "DNS metninde kok domain IP'si", s.dns.text.includes(SERVER_IP), s.dns.text);
  const none = buildSnippets(snapshot({ tenant: { customDomain: null } }), SERVER_IP);
  ok("snippet", "custom domain yoksa domain metinleri null", ["dns", "certbot", "nginx-config", "nginx-commands", "supabase"].map((k) => none[k]), [null, null, null, null, null], "null");
  okTrue("snippet", "wildcard satiri her zaman var", none["supabase-wildcard"] !== null, "wildcard");
}

// ---------------------------------------------------------------------------
header("(b) Custom domain degisim penceresi");

ok("degisim", "ilk kez girilen domain → pencere YOK", buildDomainChangeNotice(null, DOMAIN), null, "null → domain");
ok("degisim", "degismedi → pencere YOK", buildDomainChangeNotice(DOMAIN, DOMAIN), null, "ayni");
ok("degisim", "ikisi de bos → pencere YOK", buildDomainChangeNotice(null, null), null, "null → null");
{
  const n = buildDomainChangeNotice("eski.com", "yeni.com");
  ok("degisim", "degisti → eski 2 satir silinecek", n.supabaseRemove, buildSupabaseLines("eski.com"), "eski → yeni");
  ok("degisim", "degisti → yeni 2 satir eklenecek", n.supabaseAdd, buildSupabaseLines("yeni.com"), "eski → yeni");
  ok("degisim", "yeni domain tasinir", n.newDomain, "yeni.com", "eski → yeni");
}
{
  const n = buildDomainChangeNotice("eski.com", null);
  ok("degisim", "silindi → eski satirlar silinecek, eklenecek yok", [n.supabaseRemove.length, n.supabaseAdd.length, n.newDomain], [2, 0, null], "eski → null");
}
{
  const t = buildServerCleanupText("eski.com");
  const order = ['grep -Rln "eski.com"', "nginx -t && systemctl reload nginx", "certbot delete --cert-name eski.com"].map((k) => t.indexOf(k));
  okTrue("degisim", "sunucu temizligi: bloklar → yukle → sertifika EN SON", order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), JSON.stringify(order));
}

// ---------------------------------------------------------------------------
header("(c) Yoklama sonucu → durum");

const ORIGIN = `https://${DOMAIN}`;
ok("uygulama", "200 + dogru slug → Tamam", evaluateAppResponse(httpOk(200, null, SLUG), SLUG, ORIGIN).status, "ok", "200 kurmay");
ok("uygulama", "200 + baska slug → Eksik", evaluateAppResponse(httpOk(200, null, "default"), SLUG, ORIGIN).status, "missing", "200 default");
ok("uygulama", "200 + baslik yok → Eksik (yanit bu uygulamadan degil)", evaluateAppResponse(httpOk(200), SLUG, ORIGIN).status, "missing", "200 null");
{
  const v = evaluateAppResponse(httpOk(307, `${ORIGIN}${TENANT_ERROR_PATH}`), SLUG, ORIGIN);
  okTrue("uygulama", "307 → kurum-bulunamadi → Eksik (eslesmedi)", v.status === "missing" && v.detail.includes("eşleyemedi"), v.detail);
}
{
  const v = evaluateAppResponse(httpOk(307, TENANT_ERROR_PATH), SLUG, ORIGIN);
  okTrue("uygulama", "goreli Location da cozulur", v.detail.includes("eşleyemedi"), v.detail);
}
ok("uygulama", "502 → Eksik", evaluateAppResponse(httpOk(502), SLUG, ORIGIN).status, "missing", "502");
ok("uygulama", "sertifika hatasi → Belirlenemedi", evaluateAppResponse({ ok: false, code: "ERR_TLS_CERT_ALTNAME_INVALID" }, SLUG, ORIGIN).status, "unknown", "tls");
ok("uygulama", "DNS kapisi → Belirlenemedi", evaluateAppResponse({ ok: false, code: "DNS_NOT_READY" }, SLUG, ORIGIN).status, "unknown", "gate");
ok("uygulama", "baglanti reddi → Belirlenemedi", evaluateAppResponse({ ok: false, code: "ECONNREFUSED" }, SLUG, ORIGIN).status, "unknown", "refused");

const FROM_WWW = `https://${WWW}`;
ok("yonlendirme", "www 301 → apex → Tamam", evaluateRedirect(httpOk(301, `${ORIGIN}/`), FROM_WWW, DOMAIN).status, "ok", "301");
ok("yonlendirme", "308 de kalici → Tamam", evaluateRedirect(httpOk(308, `${ORIGIN}/`), FROM_WWW, DOMAIN).status, "ok", "308");
{
  const v = evaluateRedirect(httpOk(200, null, SLUG), FROM_WWW, DOMAIN, "IPUCU");
  okTrue("yonlendirme", "www 200 (CANLI durum) → Eksik + ipucu", v.status === "missing" && v.detail.includes("kendi başına açılıyor") && v.detail.endsWith("IPUCU"), v.detail);
}
ok("yonlendirme", "302 → Uyari (gecici)", evaluateRedirect(httpOk(302, `${ORIGIN}/`), FROM_WWW, DOMAIN).status, "warning", "302");
ok("yonlendirme", "www → https://www (certbot usulu) → Eksik", evaluateRedirect(httpOk(301, `${FROM_WWW}/`), FROM_WWW, DOMAIN).status, "missing", "301 www");
ok("yonlendirme", "http 301 → https apex → Tamam", evaluateRedirect(httpOk(301, `${ORIGIN}/`), `http://${DOMAIN}`, DOMAIN).status, "ok", "http");
ok("yonlendirme", "http 301 → http → Eksik (sifresiz hedef)", evaluateRedirect(httpOk(301, `http://${DOMAIN}/`), `http://${DOMAIN}`, DOMAIN).status, "missing", "http→http");
ok("yonlendirme", "http 200 → Eksik", evaluateRedirect(httpOk(200), `http://${DOMAIN}`, DOMAIN).status, "missing", "http 200");

const RETURN = `${ORIGIN}${AUTH_RETURN_PATH}`;
ok("supabase", "CANLI: listedeki adres → 303 ayni host → Tamam", evaluateSupabaseProbe(httpOk(303, SUPA_OK_LOCATION), RETURN).status, "ok", SUPA_OK_LOCATION);
{
  const v = evaluateSupabaseProbe(httpOk(303, SUPA_MISSING_LOCATION), RETURN);
  okTrue("supabase", "CANLI: listede olmayan → Site URL koku → Eksik", v.status === "missing" && v.detail.includes("https://buyukdirilis.org.tr"), v.detail);
}
ok("supabase", "429 → Belirlenemedi (asla sahte Tamam)", evaluateSupabaseProbe(httpOk(429), RETURN).status, "unknown", "429");
ok("supabase", "200 / Location yok → Belirlenemedi", evaluateSupabaseProbe(httpOk(200), RETURN).status, "unknown", "200");
ok("supabase", "ag hatasi → Belirlenemedi", evaluateSupabaseProbe({ ok: false, code: "TIMEOUT" }, RETURN).status, "unknown", "timeout");
ok("supabase", "Supabase adresi yok → Belirlenemedi", evaluateSupabaseProbe({ ok: false, code: "NO_SUPABASE_URL" }, RETURN).status, "unknown", "no url");

const SERVER = { ipv4: dnsOk(SERVER_IP), ipv6: dnsOk() };
const DNS_OK = { apex4: dnsOk(SERVER_IP), www4: dnsOk(SERVER_IP), apex6: dnsOk(), www6: dnsOk() };
ok("dns", "apex + www bu sunucu → Tamam", evaluateDns(DNS_OK, SERVER, DOMAIN).status, "ok", "ok");
{
  const v = evaluateDns({ ...DNS_OK, www4: dnsOk() }, SERVER, DOMAIN);
  okTrue("dns", "www A kaydi yok → Eksik", v.status === "missing" && v.detail.includes("www.kurmayteknoloji.com için A kaydı yok"), v.detail);
}
{
  const v = evaluateDns({ ...DNS_OK, apex4: dnsOk("1.2.3.4") }, SERVER, DOMAIN);
  okTrue("dns", "apex baska IP → Eksik (beklenen gosterilir)", v.status === "missing" && v.detail.includes("1.2.3.4") && v.detail.includes(`beklenen ${SERVER_IP}`), v.detail);
}
{
  const v = evaluateDns({ ...DNS_OK, apex6: dnsOk("2001:db8::1") }, SERVER, DOMAIN);
  okTrue("dns", "yabanci AAAA (platform IPv6'siz) → Eksik", v.status === "missing" && v.detail.includes("IPv6"), v.detail);
}
ok("dns", "AAAA = sunucunun IPv6'si → Tamam", evaluateDns({ ...DNS_OK, apex6: dnsOk("2001:db8::9") }, { ipv4: dnsOk(SERVER_IP), ipv6: dnsOk("2001:db8::9") }, DOMAIN).status, "ok", "v6 ayni");
ok("dns", "sunucu IPv6 bilinmiyor → AAAA karsilastirilmaz", evaluateDns({ ...DNS_OK, apex6: dnsOk("2001:db8::1") }, { ipv4: dnsOk(SERVER_IP), ipv6: { ok: false, code: "TIMEOUT" } }, DOMAIN).status, "ok", "v6 ?");
ok("dns", "kok domain cozulemedi → Belirlenemedi", evaluateDns(DNS_OK, { ipv4: { ok: false, code: "TIMEOUT" }, ipv6: dnsOk() }, DOMAIN).status, "unknown", "server ?");
ok("dns", "apex zaman asimi → Belirlenemedi", evaluateDns({ ...DNS_OK, apex4: { ok: false, code: "TIMEOUT" } }, SERVER, DOMAIN).status, "unknown", "timeout");
ok("dns", "sorun + belirsizlik → Eksik one gecer", evaluateDns({ ...DNS_OK, apex4: { ok: false, code: "TIMEOUT" }, www4: dnsOk() }, SERVER, DOMAIN).status, "missing", "mix");

{
  const v = evaluateCert([{ host: DOMAIN, probe: tlsOk(CERT_KURMAY) }, { host: WWW, probe: tlsOk(CERT_KURMAY) }], NOW, true);
  okTrue("sertifika", "CANLI Kurmay: gecerli, 7 Aralik 2026 (86 gun), kendiliginden yenilenir", v.status === "ok" && v.detail.includes("7 Aralık 2026 (86 gün)") && v.detail.includes("kendiliğinden yeniler"), v.detail);
}
{
  const v = evaluateCert([{ host: SUB, probe: tlsOk(CERT_WILDCARD) }], NOW, false);
  okTrue("sertifika", "CANLI wildcard: 24 Kasim 2026 (74 gun) + YENILENMEZ hatirlatmasi", v.status === "ok" && v.detail.includes("24 Kasım 2026 (74 gün)") && v.detail.includes("YENİLENMEZ"), v.detail);
}
ok("sertifika", "bitise 20 gun → Uyari", evaluateCert([{ host: DOMAIN, probe: tlsOk(new Date(NOW + 20 * 86_400_000 + 3_600_000).toISOString()) }], NOW, true).status, "warning", "20 gun");
{
  const v = evaluateCert([{ host: DOMAIN, probe: tlsOk(CERT_KURMAY) }, { host: WWW, probe: tlsOk(CERT_KURMAY, false, "ERR_TLS_CERT_ALTNAME_INVALID") }], NOW, true);
  okTrue("sertifika", "www'yu kapsamiyor → Eksik (host adiyla)", v.status === "missing" && v.detail.startsWith("www.kurmayteknoloji.com:"), v.detail);
}
ok("sertifika", "suresi dolmus → Eksik", evaluateCert([{ host: DOMAIN, probe: tlsOk(CERT_KURMAY, false, "CERT_HAS_EXPIRED") }], NOW, true).status, "missing", "expired");
ok("sertifika", "443 baglanamadi → Belirlenemedi", evaluateCert([{ host: DOMAIN, probe: { ok: false, code: "ECONNREFUSED" } }], NOW, true).status, "unknown", "refused");
ok("sertifika", "DNS kapisi → Belirlenemedi", evaluateCert([{ host: DOMAIN, probe: { ok: false, code: "DNS_NOT_READY" } }], NOW, true).status, "unknown", "gate");

ok("birlestir", "Eksik + Tamam → Eksik", combineVerdicts([{ status: "ok", detail: "a" }, { status: "missing", detail: "b" }]), { status: "missing", detail: "a b" }, "mix");
ok("birlestir", "Belirlenemedi + Uyari → Uyari", combineVerdicts([{ status: "unknown", detail: "a" }, { status: "warning", detail: "b" }]).status, "warning", "mix");
ok("birlestir", "Tamam + Tamam → Tamam", combineVerdicts([{ status: "ok", detail: "a" }, { status: "ok", detail: "b" }]).status, "ok", "ok");

// ---------------------------------------------------------------------------
header("(d) evaluateSetup — tum liste");

{
  const ev = evaluateSetup({ snapshot: snapshot(), probes: kurmayReport(), now: NOW });
  const domainStatuses = ["domain-dns", "domain-sertifika", "domain-nginx", "domain-yonlendirme", "domain-supabase"].map((id) => statusOf(ev, id));
  ok("kurmay", "CANLI durum: yalniz www→apex yonlendirmesi Eksik", domainStatuses, ["ok", "ok", "ok", "missing", "ok"], domainStatuses.join(","));
  const red = findItem(ev, "domain-yonlendirme");
  okTrue("kurmay", "yonlendirme ayrintisi: www 200 + server_name ipucu, http kismi Tamam", red.detail.includes("kendi başına açılıyor") && red.detail.includes("server_name") && red.detail.includes(`http://${DOMAIN} → https://${DOMAIN} (301)`), red.detail);
  ok("kurmay", "yonlendirme maddesi Nginx metinlerini gosterir", red.snippets, ["nginx-config", "nginx-commands"], "snippets");
  ok("kurmay", "subdomain maddeleri Tamam", ["kurum-aktif", "subdomain-erisim", "subdomain-sertifika", "subdomain-supabase"].map((id) => statusOf(ev, id)), ["ok", "ok", "ok", "ok"], "kurum");
  ok("kurmay", "sayaclar: 1 eksik, 0 uyari", [ev.counts.missing, ev.counts.warning, ev.counts.pending], [1, 0, 0], JSON.stringify(ev.counts));
  ok("kurmay", "ozet", summarizeSetup(ev.counts), { tone: "missing", text: "1 eksik" }, "summary");
  ok("kurmay", "Supabase maddesi Supabase metnini gosterir", findItem(ev, "domain-supabase").snippets, ["supabase"], "snippets");
  ok("kurmay", "subdomain Supabase Tamam → wildcard metni gizli", findItem(ev, "subdomain-supabase").snippets, [], "snippets");
}
{
  const fixed = kurmayReport({ httpsWww: httpOk(301, `https://${DOMAIN}/`) });
  const ev = evaluateSetup({ snapshot: snapshot(), probes: fixed, now: NOW });
  ok("kurmay", "Nginx duzeltilince (www 301) → Tamam", summarizeSetup(ev.counts), { tone: "ok", text: "Tamam" }, "fixed");
}
{
  const missing = kurmayReport({ supabase: httpOk(303, SUPA_MISSING_LOCATION) });
  const ev = evaluateSetup({ snapshot: snapshot(), probes: missing, now: NOW });
  ok("kurmay", "Redirect URLs satiri yokken (10 Eylul durumu) → Supabase Eksik", statusOf(ev, "domain-supabase"), "missing", "supabase");
}
{
  const ev = evaluateSetup({ snapshot: snapshot(), probes: undefined, now: NOW });
  ok("bekleme", "yoklama suruyor → 3 subdomain + 5 domain maddesi bekliyor", ev.counts.pending, 8, JSON.stringify(ev.counts));
  ok("bekleme", "ozet 'Kontrol ediliyor…'", summarizeSetup(ev.counts).text, "Kontrol ediliyor…", "pending");
}
{
  const ev = evaluateSetup({ snapshot: snapshot(), probes: null, now: NOW });
  ok("bekleme", "yoklama istegi basarisiz → Belirlenemedi (sahte Tamam yok)", ["subdomain-erisim", "domain-supabase"].map((id) => statusOf(ev, id)), ["unknown", "unknown"], "null");
}
{
  const other = kurmayReport();
  other.domain.domain = "baska.com";
  const ev = evaluateSetup({ snapshot: snapshot(), probes: other, now: NOW });
  ok("bekleme", "yoklama baska domain icin (arada degismis) → Belirlenemedi", statusOf(ev, "domain-dns"), "unknown", "mismatch");
}
{
  const local = {
    checkedAt: new Date(NOW).toISOString(),
    rootDomain: "lvh.me",
    localDev: true,
    server: { ipv4: { ok: false, code: "LOCAL_DEV" }, ipv6: { ok: false, code: "LOCAL_DEV" } },
    subdomain: null,
    domain: { ...kurmayReport().domain, supabase: httpOk(303, SUPA_OK_LOCATION) },
  };
  const ev = evaluateSetup({ snapshot: { ...snapshot(), rootDomain: "lvh.me" }, probes: local, now: NOW });
  ok("yerel", "yerel gelistirme: DNS/sertifika/Nginx Belirlenemedi", ["subdomain-erisim", "domain-dns", "domain-nginx", "domain-yonlendirme"].map((id) => statusOf(ev, id)), ["unknown", "unknown", "unknown", "unknown"], "local");
  ok("yerel", "yerel gelistirme: Supabase yoklamasi yine gercek sonuc", statusOf(ev, "domain-supabase"), "ok", "local");
}
{
  const ev = evaluateSetup({ snapshot: snapshot({ tenant: { customDomain: null } }), probes: { ...kurmayReport(), domain: null }, now: NOW });
  const g = ev.groups.find((x) => x.id === "domain");
  ok("domain-yok", "custom domain yok → tek Bilgi maddesi", g.items.map((i) => [i.id, i.status]), [["domain-yok", "info"]], "null");
  ok("domain-yok", "Bilgi maddesi sayaca girmez", [ev.counts.missing, ev.counts.warning], [0, 0], JSON.stringify(ev.counts));
}
{
  const ev = evaluateSetup({ snapshot: snapshot({ admins: [] }), probes: kurmayReport(), now: NOW });
  ok("admin", "admin yok → Eksik, 'ilk giris' maddesi hic yok", [statusOf(ev, "admin-davet"), findItem(ev, "admin-giris")], ["missing", null], "[]");
}
{
  const ev = evaluateSetup({
    snapshot: snapshot({ admins: [{ email: "a@x.com", invitedAt: "2026-09-08T08:00:00Z", lastSignInAt: null }] }),
    probes: kurmayReport(),
    now: NOW,
  });
  const it = findItem(ev, "admin-giris");
  okTrue("admin", "davet kabul edilmedi → Uyari + davet tarihi + yeniden ekleme ipucu", it.status === "warning" && it.detail.includes("8 Eylül 2026, 3 gün önce") && it.detail.includes("yeniden ekleyin"), it.detail);
}
{
  const ev = evaluateSetup({
    snapshot: snapshot({
      admins: [
        { email: "a@x.com", invitedAt: null, lastSignInAt: "2026-09-02T10:00:00Z" },
        { email: "b@x.com", invitedAt: "2026-09-10T10:00:00Z", lastSignInAt: null },
      ],
    }),
    probes: kurmayReport(),
    now: NOW,
  });
  const it = findItem(ev, "admin-giris");
  okTrue("admin", "biri girdi → Tamam, girmeyen de listelenir", it.status === "ok" && it.detail.includes("Henüz giriş yapmayan: b@x.com"), it.detail);
}
ok("admin", "admin listesi okunamadi → Belirlenemedi", statusOf(evaluateSetup({ snapshot: snapshot({ admins: null }), probes: kurmayReport(), now: NOW }), "admin-davet"), "unknown", "null");
{
  const ev = evaluateSetup({
    snapshot: snapshot({
      settings: { logo_url: "/placeholder-logo.png", contact_phone: "", contact_address: "Ankara" },
      counts: { categories: 0, menuItems: 5, homepageSections: 0 },
    }),
    probes: kurmayReport(),
    now: NOW,
  });
  ok("icerik", "tohum logo → Bilgi, telefon bos → Bilgi, kategori 0 → Bilgi, menu → Tamam", ["icerik-logo", "icerik-iletisim", "icerik-kategori", "icerik-menu"].map((id) => statusOf(ev, id)), ["info", "info", "info", "ok"], "icerik");
  okTrue("icerik", "iletisim ayrintisi bos alani soyler", findItem(ev, "icerik-iletisim").detail.includes("telefon") && !findItem(ev, "icerik-iletisim").detail.includes("adres"), findItem(ev, "icerik-iletisim").detail);
  ok("icerik", "anasayfa bolumu 0 → Uyari (public anasayfa bos)", statusOf(ev, "icerik-anasayfa"), "warning", "0");
}
ok("icerik", "ayarlar okunamadi → Belirlenemedi", statusOf(evaluateSetup({ snapshot: snapshot({ settings: null }), probes: kurmayReport(), now: NOW }), "icerik-logo"), "unknown", "null");
ok("icerik", "sayim okunamadi → Belirlenemedi", statusOf(evaluateSetup({ snapshot: snapshot({ counts: { categories: null } }), probes: kurmayReport(), now: NOW }), "icerik-kategori"), "unknown", "null");
ok("kurum", "pasif kurum → Uyari", statusOf(evaluateSetup({ snapshot: snapshot({ tenant: { isActive: false } }), probes: kurmayReport(), now: NOW }), "kurum-aktif"), "warning", "pasif");
{
  const probes = kurmayReport();
  probes.subdomain.supabase = httpOk(303, SUPA_MISSING_LOCATION);
  const it = findItem(evaluateSetup({ snapshot: snapshot(), probes, now: NOW }), "subdomain-supabase");
  ok("kurum", "wildcard satiri yoksa → Eksik + wildcard metni", [it.status, it.snippets], ["missing", ["supabase-wildcard"]], "sub missing");
}

ok("ozet", "hic sorun yok → Tamam", summarizeSetup({ missing: 0, warning: 0, unknown: 2, pending: 0 }), { tone: "ok", text: "Tamam" }, "0");
ok("ozet", "2 eksik + 1 uyari", summarizeSetup({ missing: 2, warning: 1, unknown: 0, pending: 0 }).text, "2 eksik · 1 uyarı", "2/1");
ok("ozet", "eksik varken yoklama suruyor", summarizeSetup({ missing: 1, warning: 0, unknown: 0, pending: 3 }).text, "1 eksik · kontrol sürüyor", "1/p");
ok("ozet", "yalniz uyari → uyari tonu", summarizeSetup({ missing: 0, warning: 1, unknown: 0, pending: 0 }).tone, "warning", "w");

// ---------------------------------------------------------------------------
header("(e) runSetupProbes — sahte DNS/TLS/fetch");

function codeErr(code) {
  return Object.assign(new Error(code), { code });
}

/**
 * Sahte ag. dns: host → dizi | hata kodu (string); http: url → yanit |
 * fonksiyon (fırlatabilir); tls: host → sonuc. Cagrilar kaydedilir.
 */
function fakeDeps({ dns4 = {}, dns6 = {}, http = {}, tls = {} } = {}) {
  const calls = { dns4: [], dns6: [], http: [], tls: [] };
  const resolveFrom = (map, host) => {
    const v = map[host];
    if (v === undefined) return Promise.reject(codeErr("ENOTFOUND"));
    if (typeof v === "string") return Promise.reject(codeErr(v));
    return Promise.resolve(v);
  };
  return {
    calls,
    deps: {
      resolve4: (host) => (calls.dns4.push(host), resolveFrom(dns4, host)),
      resolve6: (host) => (calls.dns6.push(host), resolveFrom(dns6, host)),
      httpGet: async (url) => {
        calls.http.push(url);
        const v = url.startsWith(SUPABASE_URL) ? http.supabase : http[url];
        if (typeof v === "function") return v(url);
        if (v === undefined) throw Object.assign(new TypeError("fetch failed"), { cause: codeErr("ECONNREFUSED") });
        return v;
      },
      tlsCert: async (host) => {
        calls.tls.push(host);
        const v = tls[host];
        if (v === undefined) throw codeErr("ECONNREFUSED");
        return v;
      },
    },
  };
}

/** Canli olcumun sahte agi (www 200). */
function liveNet(over = {}) {
  return {
    dns4: { [ROOT]: [SERVER_IP], [SUB]: [SERVER_IP], [DOMAIN]: [SERVER_IP], [WWW]: [SERVER_IP], ...(over.dns4 ?? {}) },
    dns6: { [ROOT]: "ENODATA", [SUB]: "ENODATA", [DOMAIN]: "ENODATA", [WWW]: [], ...(over.dns6 ?? {}) },
    http: {
      [`https://${SUB}${PROBE_PAGE_PATH}`]: { status: 200, location: null, tenantSlug: SLUG },
      [`https://${DOMAIN}${PROBE_PAGE_PATH}`]: { status: 200, location: null, tenantSlug: SLUG },
      [`https://${WWW}/`]: { status: 200, location: null, tenantSlug: SLUG },
      [`http://${DOMAIN}/`]: { status: 301, location: `https://${DOMAIN}/`, tenantSlug: null },
      supabase: (url) => {
        const to = new URL(url).searchParams.get("redirect_to");
        const host = new URL(to).host;
        return { status: 303, location: host === DOMAIN ? SUPA_OK_LOCATION : SUPA_SUB_OK_LOCATION, tenantSlug: null };
      },
      ...(over.http ?? {}),
    },
    tls: {
      [SUB]: { authorized: true, authorizationError: null, validTo: CERT_WILDCARD },
      [DOMAIN]: { authorized: true, authorizationError: null, validTo: CERT_KURMAY },
      [WWW]: { authorized: true, authorizationError: null, validTo: CERT_KURMAY },
      ...(over.tls ?? {}),
    },
  };
}

const TARGET = { slug: SLUG, rootDomain: ROOT, customDomain: DOMAIN, supabaseUrl: SUPABASE_URL };

{
  const { deps, calls } = fakeDeps(liveNet());
  const report = await runSetupProbes(TARGET, deps, new Date(NOW));
  ok("canli", "rapor: localDev false, sunucu IP'si kok domain'den", [report.localDev, report.server.ipv4], [false, dnsOk(SERVER_IP)], "report");
  ok("canli", "ENODATA / bos AAAA → kesin 'kayit yok' (ok + bos)", [report.domain.dns.apex6, report.domain.dns.www6], [dnsOk(), dnsOk()], "v6");
  const supaCalls = calls.http.filter((u) => u.startsWith(SUPABASE_URL));
  ok("canli", "Supabase 2 kez yoklanir (subdomain + custom domain)", supaCalls.length, 2, supaCalls.join(" "));
  const u = new URL(supaCalls.find((x) => x.includes(encodeURIComponent(DOMAIN + "/"))) ?? supaCalls[0]);
  ok("canli", "Supabase yoklamasi: /auth/v1/verify, recovery, gecersiz token, redirect_to", [u.pathname, u.searchParams.get("type"), u.searchParams.get("token"), u.searchParams.get("redirect_to")], ["/auth/v1/verify", "recovery", PROBE_INVALID_TOKEN, `https://${DOMAIN}${AUTH_RETURN_PATH}`], u.toString());
  const appCalls = calls.http.filter((x) => !x.startsWith(SUPABASE_URL)).sort();
  ok("canli", "uygulama yoklamalari yalniz sabit yollar", appCalls, [`http://${DOMAIN}/`, `https://${SUB}/admin/giris`, `https://${DOMAIN}/admin/giris`, `https://${WWW}/`].sort(), appCalls.join(" "));
  ok("canli", "TLS: subdomain + apex + www", calls.tls.slice().sort(), [SUB, DOMAIN, WWW].sort(), calls.tls.join(" "));
  const ev = evaluateSetup({ snapshot: snapshot(), probes: report, now: NOW });
  ok("canli", "uctan uca: yoklama → durum = canli gozlem (yalniz www Eksik)", ["domain-dns", "domain-sertifika", "domain-nginx", "domain-yonlendirme", "domain-supabase", "subdomain-erisim", "subdomain-sertifika", "subdomain-supabase"].map((id) => statusOf(ev, id)), ["ok", "ok", "ok", "missing", "ok", "ok", "ok", "ok"], "e2e");
}
{
  const { deps, calls } = fakeDeps(liveNet({ dns4: { [WWW]: ["1.2.3.4"] } }));
  const report = await runSetupProbes(TARGET, deps, new Date(NOW));
  ok("kapi", "www baska sunucuda → www'ya TLS/HTTP YOK", [calls.tls.includes(WWW), calls.http.includes(`https://${WWW}/`)], [false, false], calls.tls.join(" "));
  ok("kapi", "www yoklamasi DNS_NOT_READY ile atlandi", [report.domain.tlsWww, report.domain.httpsWww], [{ ok: false, code: "DNS_NOT_READY" }, { ok: false, code: "DNS_NOT_READY" }], "gate");
  ok("kapi", "apex yine yoklanir", report.domain.httpsApex.ok, true, "apex");
  const ev = evaluateSetup({ snapshot: snapshot(), probes: report, now: NOW });
  ok("kapi", "DNS maddesi Eksik, sertifika maddesi Belirlenemedi", [statusOf(ev, "domain-dns"), statusOf(ev, "domain-sertifika")], ["missing", "unknown"], "ev");
}
{
  const { deps, calls } = fakeDeps(liveNet({ dns4: { [DOMAIN]: ["10.0.0.5"] } }));
  const report = await runSetupProbes(TARGET, deps, new Date(NOW));
  ok("ssrf", "apex ozel IP → HIC baglanilmaz (TLS/HTTP yok)", [calls.tls.includes(DOMAIN), calls.http.some((u) => u.includes(`//${DOMAIN}/`))], [false, false], calls.http.join(" "));
  ok("ssrf", "atlama kodu PRIVATE_ADDRESS", report.domain.httpsApex, { ok: false, code: "PRIVATE_ADDRESS" }, "private");
}
{
  const { deps, calls } = fakeDeps(liveNet({ dns6: { [DOMAIN]: ["::1"] } }));
  const report = await runSetupProbes(TARGET, deps, new Date(NOW));
  ok("ssrf", "AAAA loopback → PRIVATE_ADDRESS, baglanti yok", [report.domain.tlsApex.code, calls.tls.includes(DOMAIN)], ["PRIVATE_ADDRESS", false], "::1");
}
{
  const { deps } = fakeDeps(liveNet({ dns4: { [DOMAIN]: "ETIMEOUT" } }));
  const report = await runSetupProbes(TARGET, deps, new Date(NOW));
  ok("dns-hata", "zaman asimi → ok:false (Belirlenemedi), kayit yok DEGIL", report.domain.dns.apex4, { ok: false, code: "ETIMEOUT" }, "timeout");
}
{
  const { deps, calls } = fakeDeps(liveNet());
  const report = await runSetupProbes({ ...TARGET, rootDomain: "lvh.me" }, deps, new Date(NOW));
  ok("yerel", "lvh.me → localDev, subdomain yok", [report.localDev, report.subdomain], [true, null], "local");
  ok("yerel", "yerelde DNS/TLS yok, yalniz Supabase", [calls.dns4.length, calls.dns6.length, calls.tls.length, calls.http.length], [0, 0, 0, 1], JSON.stringify(calls));
  ok("yerel", "yerelde Supabase sonucu gercek", report.domain.supabase.ok && report.domain.supabase.status, 303, "supabase");
}
{
  const { deps, calls } = fakeDeps(liveNet());
  const report = await runSetupProbes({ ...TARGET, rootDomain: "lvh.me", customDomain: null }, deps, new Date(NOW));
  ok("yerel", "yerel + custom domain yok → hic ag cagrisi yok", [report.domain, calls.http.length], [null, 0], "none");
}
{
  const { deps, calls } = fakeDeps(liveNet());
  const report = await runSetupProbes({ ...TARGET, supabaseUrl: null }, deps, new Date(NOW));
  ok("supabase-url", "Supabase adresi yok → NO_SUPABASE_URL, cagri yok", [report.domain.supabase, calls.http.some((u) => u.includes("/auth/v1/"))], [{ ok: false, code: "NO_SUPABASE_URL" }, false], "null");
}
{
  const { deps, calls } = fakeDeps(liveNet());
  const report = await runSetupProbes({ ...TARGET, customDomain: null }, deps, new Date(NOW));
  ok("domain-yok", "custom domain yok → domain raporu null, domain host'una cagri yok", [report.domain, calls.dns4.includes(DOMAIN), calls.tls.includes(DOMAIN)], [null, false, false], "null");
}
{
  const net = liveNet({
    http: {
      [`https://${DOMAIN}${PROBE_PAGE_PATH}`]: () => {
        throw Object.assign(new TypeError("fetch failed"), { cause: codeErr("ERR_TLS_CERT_ALTNAME_INVALID") });
      },
      [`https://${WWW}/`]: () => {
        throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
      },
    },
  });
  const { deps } = fakeDeps(net);
  const report = await runSetupProbes(TARGET, deps, new Date(NOW));
  ok("hata-kodu", "undici cause.code okunur", report.domain.httpsApex, { ok: false, code: "ERR_TLS_CERT_ALTNAME_INVALID" }, "cause");
  ok("hata-kodu", "TimeoutError → TIMEOUT", report.domain.httpsWww, { ok: false, code: "TIMEOUT" }, "timeout");
}
{
  const boom = () => Promise.reject(new Error("beklenmeyen"));
  let threw = false;
  let report = null;
  try {
    report = await runSetupProbes(TARGET, { resolve4: boom, resolve6: boom, httpGet: boom, tlsCert: boom }, new Date(NOW));
  } catch {
    threw = true;
  }
  ok("dayaniklilik", "tum bagimliliklar firlatsa da runSetupProbes FIRLATMAZ", threw, false, "boom");
  const ev = evaluateSetup({ snapshot: snapshot(), probes: report, now: NOW });
  ok("dayaniklilik", "o durumda hicbir madde sahte Tamam degil", ["domain-dns", "domain-sertifika", "domain-nginx", "domain-yonlendirme", "domain-supabase", "subdomain-erisim"].map((id) => statusOf(ev, id)), ["unknown", "unknown", "unknown", "unknown", "unknown", "unknown"], "boom");
}

// ---------------------------------------------------------------------------
header("(f) IP / hata kodu yardimcilari");

for (const [ip, want] of [
  [SERVER_IP, true],
  ["8.8.8.8", true],
  ["127.0.0.1", false],
  ["10.1.2.3", false],
  ["172.16.0.1", false],
  ["172.32.0.1", true],
  ["192.168.1.1", false],
  ["169.254.169.254", false],
  ["100.64.0.1", false],
  ["0.0.0.0", false],
  ["224.0.0.1", false],
  ["256.1.1.1", false],
  ["1.2.3", false],
  ["a.b.c.d", false],
]) {
  ok("ipv4", `${ip} → ${want ? "genel" : "ozel/gecersiz"}`, isPublicIPv4(ip), want, ip);
}
for (const [ip, want] of [
  ["2a00:1450:4001::65", true],
  ["::1", false],
  ["::", false],
  ["fe80::1", false],
  ["fd00::1", false],
  ["ff02::1", false],
  ["::ffff:10.0.0.1", false],
  ["::ffff:8.8.8.8", true],
  ["8.8.8.8", false],
]) {
  ok("ipv6", `${ip} → ${want ? "genel" : "ozel/gecersiz"}`, isPublicIPv6(ip), want, ip);
}
ok("kapi", "kok IP bilinmiyorsa kapi yalniz ozel-IP'ye bakar", gateHost(dnsOk("1.2.3.4"), dnsOk(), { ok: false, code: "TIMEOUT" }), null, "server ?");
ok("kapi", "kayit yok → DNS_NOT_READY", gateHost(dnsOk(), dnsOk(), dnsOk(SERVER_IP)), "DNS_NOT_READY", "[]");
ok("hata-kodu", "err.code", probeErrorCode(codeErr("ECONNRESET")), "ECONNRESET", "code");
ok("hata-kodu", "AbortError → TIMEOUT", probeErrorCode(Object.assign(new Error("x"), { name: "AbortError" })), "TIMEOUT", "abort");
ok("hata-kodu", "bilinmeyen → ERROR", probeErrorCode("metin"), "ERROR", "string");
ok("yerel", "lvh.me / localhost yerel; canli kok degil", [isLocalRootDomain("lvh.me"), isLocalRootDomain("localhost"), isLocalRootDomain(ROOT)], [true, true, false], "roots");
ok("supabase-url", "yoklama URL'i", buildSupabaseProbeUrl(SUPABASE_URL, `https://${DOMAIN}/admin/davet-kabul`), `${SUPABASE_URL}/auth/v1/verify?type=recovery&token=${PROBE_INVALID_TOKEN}&redirect_to=https%3A%2F%2Fkurmayteknoloji.com%2Fadmin%2Fdavet-kabul`, "url");
ok("tarih", "formatTrDate", formatTrDate(CERT_KURMAY), "7 Aralık 2026", CERT_KURMAY);
ok("tarih", "daysUntil (86 gun)", daysUntil(CERT_KURMAY, NOW), 86, CERT_KURMAY);
ok("tarih", "formatAgo", [formatAgo("2026-09-11T08:00:00Z", NOW), formatAgo("2026-09-08T08:00:00Z", NOW)], ["bugün", "3 gün önce"], "ago");

// ---------------------------------------------------------------------------
header("(g) Kod tutarliligi");

ok("tutarlilik", "iki modulun donus yolu ayni (import'suz kopya)", SUPABASE_RETURN_PATH, AUTH_RETURN_PATH, SUPABASE_RETURN_PATH);
{
  const routeFile = `src/app${SETUP_CHECK_API_PATH}/route.ts`;
  okTrue("tutarlilik", "route dosyasi var", existsSync(routeFile), routeFile);
  const route = readFileSync(routeFile, "utf8");
  okTrue("tutarlilik", "route ?probe=1 ile yoklar", route.includes('searchParams.get("probe") === "1"'), routeFile);
  okTrue("tutarlilik", "route force-dynamic", route.includes('export const dynamic = "force-dynamic"'), routeFile);
  okTrue("tutarlilik", "route host'u istemciden ALMAZ (yalniz tenantId)", !/searchParams\.get\("(host|domain|url)"\)/.test(route), routeFile);
  const comp = readFileSync("src/components/super-admin/SetupChecklist.tsx", "utf8");
  okTrue("tutarlilik", "bilesen ayni sabiti kullanir + &probe=1", comp.includes("SETUP_CHECK_API_PATH") && comp.includes("&probe=1"), "SetupChecklist");
}
{
  const mw = readFileSync("src/middleware.ts", "utf8");
  okTrue("tutarlilik", "middleware TENANT_ERROR_PATH ayni", mw.includes(`const TENANT_ERROR_PATH = "${TENANT_ERROR_PATH}";`), TENANT_ERROR_PATH);
  okTrue("tutarlilik", "middleware yanita x-tenant-slug yazar", mw.includes('supabaseResponse.headers.set("x-tenant-slug", tenantSlug);'), "middleware");
  okTrue("tutarlilik", "yoklanan sayfa girissiz acilir (ADMIN_PUBLIC_PATHS)", mw.includes(`"${PROBE_PAGE_PATH}",`), PROBE_PAGE_PATH);
}
{
  const form = readFileSync("src/app/admin/sifremi-unuttum/SifremiUnuttumForm.tsx", "utf8");
  okTrue("tutarlilik", "sifirlama origin + /admin/davet-kabul'e doner (Supabase satiri bu yol)", form.includes("window.location.origin") && form.includes(AUTH_RETURN_PATH), "SifremiUnuttumForm");
}
{
  const upd = readFileSync("src/app/api/super-admin/update-tenant/route.ts", "utf8");
  okTrue("tutarlilik", "update-tenant kaydedilen custom domain'i doner", upd.includes("customDomain: normalizedCustomDomain"), "update-tenant");
  const page = readFileSync("src/app/super-admin/tenants/[id]/page.tsx", "utf8");
  okTrue("tutarlilik", "tenants/[id] listeyi ve pencereyi baglar", page.includes("<SetupChecklist") && page.includes("<DomainChangeDialog") && page.includes("buildDomainChangeNotice("), "page");
}

// ---------------------------------------------------------------------------
console.log("");
console.log(`SONUC: ${passed} gecti, ${failures.length} kaldi`);
console.log("");
// process.exit() YERINE exitCode (bkz. test-storage-ownership.mjs notu)
process.exitCode = failures.length === 0 ? 0 : 1;
