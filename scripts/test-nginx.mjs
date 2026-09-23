/**
 * NGINX SITE / HTTP DOSYALARI MUHRU (23 Eylul 2026).
 *
 * CALISTIRMA:
 *   npm run test:nginx
 *   (= node scripts/test-nginx.mjs)
 *
 * Kapsam: repo deploy/nginx/ altindaki SUNUCU GENELI dosyalar — platform site
 * dosyasi (sites-available/sendika), jetonsuz log bicimi (conf.d). Parcalar
 * (snippets/, gorsel siniri) test-gorsel-zinciri.mjs bolum (g)'de; musteri
 * sablonu test-setup-checklist.mjs'te.
 *
 * Metin muhru: satirlar yorumlardan arindirilip aranir. nginx'in kendisiyle
 * sinama (nginx -t, yerel 1.18.0) rapordaki deneyde; bu test CI'da nginx
 * gerektirmez.
 */
import { existsSync, readFileSync } from "node:fs";

const REPO = new URL("../", import.meta.url);
let gecti = 0;
const hatalar = [];
const iddia = (ad, kosul, ayrinti = "") => {
  if (kosul) { gecti++; console.log(`  PASS  ${ad}`); }
  else { hatalar.push(ad); console.log(`  FAIL  ${ad}${ayrinti ? `\n          ${ayrinti}` : ""}`); }
};
const yol = (g) => new URL(g, REPO);
const oku = (g) => readFileSync(yol(g), "utf8");
/** `#` yorumlarini atar (tirnak icindeki # korunur — log bicimi / map deseni). */
const yorumsuz = (m) =>
  m.split(/\r?\n/).map((s) => {
    let tek = false, cift = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === "'" && !cift) tek = !tek;
      else if (c === '"' && !tek) cift = !cift;
      else if (c === "#" && !tek && !cift) return s.slice(0, i);
    }
    return s;
  }).join("\n");
const say = (m, parca) => m.split(parca).length - 1;
/** Ust duzey `server { … }` bloklari (ic ice suslu parantez sayilarak). */
function bloklar(m) {
  const out = [];
  const re = /(^|\n)\s*server\s*\{/g;
  let r;
  while ((r = re.exec(m))) {
    let d = 0, i = m.indexOf("{", r.index);
    const bas = i;
    for (; i < m.length; i++) { if (m[i] === "{") d++; else if (m[i] === "}" && --d === 0) break; }
    out.push(m.slice(bas + 1, i));
  }
  return out;
}

// ---------------------------------------------------------------------------
console.log("\n--- (1) platform site dosyasi — deploy/nginx/sites-available/sendika");
const PLATFORM = "deploy/nginx/sites-available/sendika";
iddia(`dosya repoda: ${PLATFORM}`, existsSync(yol(PLATFORM)));
const plat = yorumsuz(oku(PLATFORM));
const [p80, p443] = bloklar(plat);
iddia("iki server blogu (80 + 443)", bloklar(plat).length === 2, String(bloklar(plat).length));
iddia("80: platform apex + joker, https'e 301 ayni host", /listen 80;/.test(p80) && p80.includes("server_name buyukdirilis.org.tr *.buyukdirilis.org.tr;") && p80.includes("return 301 https://$host$request_uri;"), p80);
iddia("🔴 80: default_server DEGIL (varsayilan blok 000-varsayilan-red'de)", !/default_server/.test(plat));
iddia("443: ssl + ayni server_name", /listen 443 ssl/.test(p443) && p443.includes("server_name buyukdirilis.org.tr *.buyukdirilis.org.tr;"));
iddia("443: sertifika platform alan adinin (dns-cloudflare joker)", p443.includes("ssl_certificate /etc/letsencrypt/live/buyukdirilis.org.tr/fullchain.pem;") && p443.includes("ssl_certificate_key /etc/letsencrypt/live/buyukdirilis.org.tr/privkey.pem;"));
for (const parca of ["snippets/sendika-statik.conf", "snippets/sendika-gorsel-ucu.conf", "snippets/sendika-uygulama.conf"]) {
  iddia(`443: parca TAM BIR KEZ: ${parca}`, say(p443, `include ${parca};`) === 1);
}
iddia("🔴 443: satir ici proxy_pass YOK (uygulamaya giden her yol parcadan)", say(p443, "proxy_pass") === 0);
iddia("443: location / yalniz uygulama parcasini include eder", /location \/ \{\s*include snippets\/sendika-uygulama\.conf;\s*\}/.test(p443));
iddia("443: HSTS 'always'", /add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;/.test(p443));
iddia("443: yukleme siniri 450M (musteri sablonuyla ayni)", p443.includes("client_max_body_size 450M;"));

// ---------------------------------------------------------------------------
console.log("\n--- (2) jetonsuz log bicimi — deploy/nginx/conf.d/sendika-log-jetonsuz.conf");
const LOG = "deploy/nginx/conf.d/sendika-log-jetonsuz.conf";
iddia(`dosya repoda: ${LOG}`, existsSync(yol(LOG)));
const log = yorumsuz(oku(LOG));
iddia("log_format jetonsuz TAM BIR KEZ", say(log, "log_format jetonsuz") === 1);
iddia("map $request_uri → $log_uri", /map \$request_uri \$log_uri \{/.test(log));
iddia("🔴 map: token_hash iceren sorgu → yol + '?jeton-gizlendi'", log.includes('"~^(?<yol>[^?]*)\\?.*token_hash="') && log.includes('"$yol?jeton-gizlendi";'));
iddia("map: varsayilan $request_uri", /default\s+\$request_uri;/.test(log));
const bicim = (log.match(/log_format jetonsuz([\s\S]*?);/) || [])[1] || "";
iddia("🔴 bicim $log_uri kullanir — $request / $request_uri / $args YOK (jeton sizmaz)", bicim.includes("$log_uri") && !/\$request(?!_method)\b|\$request_uri|\$args|\$query_string/.test(bicim), bicim.replace(/\s+/g, " "));
iddia("🔴 access_log AYNI dosyada, tanimdan SONRA (tanimdan once kullanilamaz)", log.indexOf("access_log /var/log/nginx/access.log jetonsuz;") > log.indexOf("log_format jetonsuz"));
iddia("dosyada server blogu YOK (http baglami)", bloklar(log).length === 0);

// ---------------------------------------------------------------------------
console.log("\n--- (3) varsayilan red — deploy/nginx/sites-available/000-varsayilan-red");
const RED = "deploy/nginx/sites-available/000-varsayilan-red";
iddia(`dosya repoda: ${RED}`, existsSync(yol(RED)));
const redHam = oku(RED);
const red = yorumsuz(redHam);
const redBloklar = bloklar(red);
const r443 = redBloklar.find((b) => /listen 443/.test(b)) || "";
const r80 = redBloklar.find((b) => /listen 80\b/.test(b)) || "";
iddia("iki server blogu (443 + 80)", redBloklar.length === 2 && !!r443 && !!r80, String(redBloklar.length));
iddia("🔴 443: `listen 443 ssl default_server;` TAM BIR KEZ", say(red, "listen 443 ssl default_server;") === 1);
iddia("🔴 80: `listen 80 default_server;` TAM BIR KEZ", say(red, "listen 80 default_server;") === 1);
for (const [ad, b] of [["443", r443], ["80", r80]]) {
  iddia(`${ad}: return 444 (yanitsiz kapat)`, /return 444;/.test(b));
  iddia(`${ad}: server_name _`, /server_name _;/.test(b));
  iddia(`🔴 ${ad}: proxy_pass / location / include snippets YOK (hicbir sey servis etmez)`, !/proxy_pass|location|include snippets\//.test(b));
  iddia(`${ad}: access_log varsayilan-red.log jetonsuz`, b.includes("access_log /var/log/nginx/varsayilan-red.log jetonsuz;"));
}
iddia("🔴 443: options-ssl-nginx.conf include (soketin TLS protokolunu varsayilan blok belirler)", r443.includes("include /etc/letsencrypt/options-ssl-nginx.conf;"));
iddia("443: ssl_dhparam", r443.includes("ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;"));
iddia("443: kendinden imzali sertifika /etc/nginx/ssl (letsencrypt DEGIL — nobetci saymaz)", r443.includes("ssl_certificate     /etc/nginx/ssl/varsayilan-red.crt;") && r443.includes("ssl_certificate_key /etc/nginx/ssl/varsayilan-red.key;") && !/ssl_certificate[^;]*letsencrypt/.test(r443));
iddia("gerekce yorumu: options-ssl include'unun NEDENI dosyada yazili", /options-ssl-nginx\.conf[\s\S]*TLS/.test(redHam) && redHam.includes("BÜTÜN sitelerin TLS ayarı değişir"));
iddia("sertifika uretme komutu dosyada yazili (CN=invalid, 3650 gun)", redHam.includes('-subj "/CN=invalid"') && redHam.includes("-days 3650"));
iddia("jetonsuz bicimi repodaki conf.d dosyasinda tanimli (bu dosya onu kullaniyor)", say(log, "log_format jetonsuz") === 1);

// ---------------------------------------------------------------------------
console.log("\n--- (4) repo geneli: default_server yalniz varsayilan red dosyasinda");
{
  const { readdirSync, statSync } = await import("node:fs");
  const hepsi = [];
  const gez = (d) => { for (const a of readdirSync(yol(d))) { const g = `${d}/${a}`; statSync(yol(g)).isDirectory() ? gez(g) : hepsi.push(g); } };
  gez("deploy/nginx");
  const sahip = hepsi.filter((g) => /default_server/.test(yorumsuz(oku(g))));
  iddia("default_server iceren tek dosya 000-varsayilan-red", JSON.stringify(sahip) === JSON.stringify([RED]), JSON.stringify(sahip));
  const { NGINX_DEFAULT_RED_SITE, NGINX_LOG_CONF } = await import("../src/lib/super-admin/setup-checklist.ts");
  iddia("setup-checklist on sart adlari repodaki dosyalar", existsSync(yol(`deploy/nginx/${NGINX_DEFAULT_RED_SITE}`)) && existsSync(yol(`deploy/nginx/${NGINX_LOG_CONF}`)), `${NGINX_DEFAULT_RED_SITE} ${NGINX_LOG_CONF}`);
}

console.log("");
console.log(`SONUC: ${gecti} gecti, ${hatalar.length} kaldi`);
process.exitCode = hatalar.length ? 1 : 0;
