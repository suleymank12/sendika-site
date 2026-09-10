/**
 * Yeni kurum kurulum kontrol listesi ("Kurulum Durumu") — SAF mantık.
 * (11 Eylül 2026)
 *
 * NEDEN: Yeni müşteri kurulumunun bir kısmı KOD DIŞINDA (DNS, Nginx, SSL,
 * Supabase Dashboard) ve unutuluyordu. Kurmay Teknoloji'de Supabase Redirect
 * URLs satırı atlanmıştı → custom domain'de şifre sıfırlama linki
 * `buyukdirilis.org.tr/?code=…`'a düşüp anasayfayı açıyordu. KURULUM.md'yi
 * kimse açıp okumuyor; durum panelde görünür olmalı.
 *
 * TASARIM (NOTE.md → "Kurulum Durumu"):
 *  - Onay kutusu / DB kaydı YOK. Elle işaretlenen "yapıldı" NİYETİ saklar,
 *    gerçeği değil; zamanla bayatlar (DNS değişir, sertifika yenilenmez).
 *    Her madde her açılışta yeniden ÖLÇÜLÜR: DB/Auth'tan okunur ya da
 *    sunucudan canlı yoklanır (setup-probes.ts).
 *  - Ölçülemeyen madde "Belirlenemedi" olur — ASLA sahte "Tamam".
 *  - Elle yapılacak adımların hazır metni domain'den üretilir (kopyala).
 *
 * Bu dosya IMPORT'SUZ: client bileşeni (SetupChecklist), tenants/[id]
 * sayfası ve Node test script'i (type stripping) aynı kodu kullanır.
 * Test: scripts/test-setup-checklist.mjs
 */

// ---------------------------------------------------------------------------
// Sabitler
// ---------------------------------------------------------------------------

/** Kontrol route'u — bileşen bu yolu çağırır, test dosyanın varlığını sınar. */
export const SETUP_CHECK_API_PATH = "/api/super-admin/tenant-setup-check";

/** Nginx'in uygulamaya ilettiği adres (PM2 `sendika`, standalone server). */
export const APP_UPSTREAM = "http://127.0.0.1:3000";

/**
 * Şifre sıfırlama (ve davet) dönüş sayfası — Supabase Redirect URLs
 * satırları bu yolla biter. setup-probes.ts'teki SUPABASE_RETURN_PATH ile
 * AYNI olmalı (import'suz modüller; test ikisini karşılaştırır).
 */
export const AUTH_RETURN_PATH = "/admin/davet-kabul";

/**
 * Middleware'in çözülemeyen custom domain'i yönlendirdiği sayfa.
 * middleware.ts'teki TENANT_ERROR_PATH ile AYNI (test karşılaştırır).
 */
export const TENANT_ERROR_PATH = "/admin/tenant-bulunamadi";

/** Tohumdaki logo (create-tenant) — hâlâ buysa logo yüklenmemiş. */
export const PLACEHOLDER_LOGO_URL = "/placeholder-logo.png";

/**
 * Sertifika bitişine bu kadar gün kala uyarı. certbot kendiliğinden
 * yenilenen sertifikaları 30 gün kala yeniler; eşiğin altındaki bir müşteri
 * sertifikası "yenileme çalışmıyor" demektir.
 */
export const CERT_WARN_DAYS = 30;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export type CheckStatus = "ok" | "missing" | "warning" | "info" | "unknown" | "pending";

export const STATUS_LABELS: Record<CheckStatus, string> = {
  ok: "Tamam",
  missing: "Eksik",
  warning: "Uyarı",
  info: "Bilgi",
  unknown: "Belirlenemedi",
  pending: "Kontrol ediliyor",
};

export type SnippetId =
  | "dns"
  | "certbot"
  | "nginx-config"
  | "nginx-commands"
  | "supabase"
  | "supabase-wildcard";

export interface Snippet {
  id: SnippetId;
  title: string;
  note: string | null;
  text: string;
  /** Her satır ayrı kopyalanır (Supabase Dashboard'da her URL ayrı alan). */
  perLine: boolean;
}

export interface CheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  snippets: SnippetId[];
}

export type CheckGroupId = "kurum" | "admin" | "domain" | "icerik";

export interface CheckGroup {
  id: CheckGroupId;
  title: string;
  note: string | null;
  items: CheckItem[];
}

export interface SetupAdmin {
  email: string;
  invitedAt: string | null;
  lastSignInAt: string | null;
}

/** Route'un DB/Auth'tan okuduğu anlık durum. null alan = okunamadı. */
export interface SetupSnapshot {
  tenant: {
    id: string;
    slug: string;
    name: string;
    customDomain: string | null;
    isActive: boolean;
  };
  /** Platform kök domain'i (NEXT_PUBLIC_ROOT_DOMAIN, portsuz). */
  rootDomain: string;
  admins: SetupAdmin[] | null;
  settings: Record<string, string | null> | null;
  counts: {
    categories: number | null;
    menuItems: number | null;
    homepageSections: number | null;
  };
}

/** Yoklama yapılmadıysa sebep (setup-probes.ts üretir). */
export type ProbeSkipCode = "DNS_NOT_READY" | "PRIVATE_ADDRESS" | "NO_SUPABASE_URL" | "LOCAL_DEV";

/**
 * DNS sorgusu. "Kayıt yok" (ENOTFOUND/ENODATA) KESİN bir cevaptır →
 * ok:true + boş liste. ok:false yalnız cevap alınamadığında (zaman aşımı).
 */
export type DnsLookup = { ok: true; addresses: string[] } | { ok: false; code: string };

/** Yönlendirme takip EDİLMEDEN tek HTTP isteği. */
export type HttpProbe =
  | { ok: true; status: number; location: string | null; tenantSlug: string | null }
  | { ok: false; code: ProbeSkipCode | string };

/** TLS el sıkışması: sertifika reddedilse de okunur (authorized ayrı). */
export type TlsProbe =
  | { ok: true; authorized: boolean; authorizationError: string | null; validTo: string | null }
  | { ok: false; code: ProbeSkipCode | string };

export interface SubdomainProbes {
  host: string;
  dns: DnsLookup;
  http: HttpProbe;
  tls: TlsProbe;
  supabase: HttpProbe;
}

export interface DomainProbes {
  domain: string;
  dns: { apex4: DnsLookup; www4: DnsLookup; apex6: DnsLookup; www6: DnsLookup };
  tlsApex: TlsProbe;
  tlsWww: TlsProbe;
  /** https://<domain>/admin/giris */
  httpsApex: HttpProbe;
  /** https://www.<domain>/ */
  httpsWww: HttpProbe;
  /** http://<domain>/ */
  httpApex: HttpProbe;
  supabase: HttpProbe;
}

export interface SetupProbeReport {
  checkedAt: string;
  rootDomain: string;
  /**
   * Yerel geliştirme kökü (lvh.me / localhost): "bu sunucu" canlı sunucu
   * değil — DNS/TLS/Nginx yoklanmaz, yalnız Supabase yoklaması çalışır.
   */
  localDev: boolean;
  /** Kök domain'in kayıtları = "bu sunucu" (IP koda gömülmez). */
  server: { ipv4: DnsLookup; ipv6: DnsLookup };
  /** null = yerel geliştirme kökü (lvh.me / localhost) — yoklanmaz. */
  subdomain: SubdomainProbes | null;
  /** null = kurumun custom domain'i yok. */
  domain: DomainProbes | null;
}

// ---------------------------------------------------------------------------
// Küçük yardımcılar
// ---------------------------------------------------------------------------

const TR_DATE = new Intl.DateTimeFormat("tr-TR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Istanbul",
});

/** ISO tarih → "7 Aralık 2026". Geçersizse girdiyi döndürür. */
export function formatTrDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : TR_DATE.format(d);
}

/** Şimdiden hedefe tam gün (geçmişse negatif); geçersiz tarihte null. */
export function daysUntil(iso: string, now: number): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((t - now) / 86_400_000);
}

/** "bugün" / "3 gün önce" */
export function formatAgo(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const days = Math.floor((now - t) / 86_400_000);
  return days <= 0 ? "bugün" : `${days} gün önce`;
}

function parseUrl(value: string | null, base?: string): URL | null {
  if (!value) return null;
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

/** Sertifika hatası mı (bağlantı hatasından ayırmak için)? */
export function isTlsErrorCode(code: string): boolean {
  return (
    /^(ERR_TLS_|ERR_SSL_|CERT_|UNABLE_TO_)/.test(code) ||
    code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
    code === "SELF_SIGNED_CERT_IN_CHAIN"
  );
}

export function describeTlsError(code: string): string {
  if (code === "ERR_TLS_CERT_ALTNAME_INVALID") {
    return "sunucu bu ad için sertifika sunmuyor (başka bir adın sertifikası geliyor)";
  }
  if (code === "CERT_HAS_EXPIRED") return "sertifikanın süresi dolmuş";
  if (code === "DEPTH_ZERO_SELF_SIGNED_CERT" || code === "SELF_SIGNED_CERT_IN_CHAIN") {
    return "sertifika kendinden imzalı";
  }
  if (code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" || code === "UNABLE_TO_GET_ISSUER_CERT_LOCALLY") {
    return "sertifika zinciri eksik (fullchain.pem kullanılmalı)";
  }
  return `sertifika doğrulanamadı (${code})`;
}

export function describeConnectionError(code: string): string {
  if (code === "DNS_NOT_READY") return "DNS bu sunucuyu göstermediği için yoklanmadı";
  if (code === "PRIVATE_ADDRESS") {
    return "alan adı özel/yerel bir IP'ye çözülüyor, güvenlik gereği yoklanmadı";
  }
  if (code === "NO_SUPABASE_URL") return "Supabase adresi ortam değişkenlerinde yok";
  if (code === "LOCAL_DEV") return "yerel geliştirme ortamında yoklanmaz";
  if (code === "TIMEOUT" || code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
    return "zaman aşımı";
  }
  if (code === "ECONNREFUSED") return "bağlantı reddedildi";
  if (code === "ECONNRESET") return "bağlantı koptu";
  if (code === "ENOTFOUND" || code === "ENODATA" || code === "EAI_AGAIN") {
    return "alan adı çözülemedi";
  }
  return `bağlantı hatası (${code})`;
}

function upperFirst(s: string): string {
  return s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);
}

// ---------------------------------------------------------------------------
// Hazır metinler
// ---------------------------------------------------------------------------

/**
 * Custom domain başına Supabase Redirect URLs satırları — İKİ satır.
 *  [0] apex — ZORUNLU: şifre sıfırlama `window.location.origin`'e döner
 *      (SifremiUnuttumForm) ve www→apex 301 yüzünden origin hep apex'tir.
 *  [1] www — SAVUNMA: 301 kurulmadan önce ya da bozulursa.
 * Sondaki `*` bilerek var: glob'da `*` sıfır karakteri de eşler (yıldızsız
 * hali de kapsar) ama `.` ve `/` geçmez — başka siteye kapı açmaz.
 * Davetler Site URL'e (apex) döndüğü için bu satırlara ihtiyaç duymaz.
 * Yalnız custom_domain alanındaki TEK domain için üretilir: başka domain'ler
 * (ör. .com.tr → .com 301) sıfırlama sayfası açmadığı için satır istemez.
 */
export function buildSupabaseLines(domain: string): string[] {
  return [`https://${domain}${AUTH_RETURN_PATH}*`, `https://www.${domain}${AUTH_RETURN_PATH}*`];
}

/** Subdomain'ler için platform satırı (KURULUM.md Adım 6). */
export function buildSupabaseWildcardLine(rootDomain: string): string {
  return `https://*.${rootDomain}${AUTH_RETURN_PATH}*`;
}

export function buildDnsRecordsText(serverIp: string | null): string {
  const ip = serverIp ?? "<sunucu IP'si>";
  return ["Tür   Ad    Değer", `A     @     ${ip}`, `A     www   ${ip}`].join("\n");
}

export function buildCertbotText(domain: string): string {
  return [
    "# Sertifika (apex + www) — yalnız sertifikayı alır, Nginx ayarına dokunmaz",
    `certbot certonly --nginx -d ${domain} -d www.${domain}`,
    "",
    "# Kendiliğinden yenileme sınaması",
    `certbot renew --dry-run --cert-name ${domain}`,
  ].join("\n");
}

/**
 * Müşteri domain'i için tam Nginx dosyası: 3 blok.
 * Uygulama bloğu canlıdaki çalışan bloktan alındı (11 Eylül 2026) — TEK
 * düzeltmeyle: apex bloğunun server_name satırında www YOK. Canlıda vardı →
 * www→apex 301 hiç devreye girmiyordu, www kendi başına açılıyordu (ölçüldü).
 */
export function buildNginxConfig(domain: string): string {
  const www = `www.${domain}`;
  const live = `/etc/letsencrypt/live/${domain}`;
  const ssl = [
    `    ssl_certificate     ${live}/fullchain.pem;`,
    `    ssl_certificate_key ${live}/privkey.pem;`,
    "    include /etc/letsencrypt/options-ssl-nginx.conf;",
    "    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;",
  ];
  return [
    `# ${domain} — Nginx yapılandırması (3 blok)`,
    "#",
    "# (1) apex: uygulamaya giden TEK blok. server_name satırında YALNIZ",
    `#     ${domain} var — www BURAYA EKLENMEZ. Eklenirse (2) hiç`,
    "#     eşleşmez, www kendi başına açılır (301 olmaz).",
    `# (2) www → apex 301: ${www} YALNIZ burada.`,
    "# (3) http → https 301: 80 portu, apex + www birlikte, doğrudan apex'e.",
    "",
    "# (1) apex — uygulama",
    "server {",
    "    listen 443 ssl;",
    `    server_name ${domain};`,
    "",
    ...ssl,
    "",
    "    client_max_body_size 450M;",
    "",
    "    location /_next/static/ {",
    `        proxy_pass ${APP_UPSTREAM};`,
    '        add_header Cache-Control "public, max-age=31536000, immutable";',
    "    }",
    "",
    "    location / {",
    `        proxy_pass ${APP_UPSTREAM};`,
    "        proxy_http_version 1.1;",
    "        proxy_set_header Upgrade $http_upgrade;",
    "        proxy_set_header Connection 'upgrade';",
    "        proxy_set_header Host $host;",
    "        proxy_set_header X-Forwarded-Host $host;",
    "        proxy_set_header X-Forwarded-Port 443;",
    "        proxy_set_header X-Real-IP $remote_addr;",
    "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
    "        proxy_set_header X-Forwarded-Proto $scheme;",
    "        proxy_cache_bypass $http_upgrade;",
    "    }",
    "}",
    "",
    "# (2) www → apex 301",
    "server {",
    "    listen 443 ssl;",
    `    server_name ${www};`,
    "",
    ...ssl,
    "",
    `    return 301 https://${domain}$request_uri;`,
    "}",
    "",
    "# (3) http → https (apex + www)",
    "server {",
    "    listen 80;",
    `    server_name ${domain} ${www};`,
    `    return 301 https://${domain}$request_uri;`,
    "}",
  ].join("\n");
}

/**
 * Nginx dosyasını kurma komutları. Sıra bilerek böyle: yeni dosya önce
 * yazılır, eski bloklar sonra silinir, yükleme EN SONDA tek sefer — arada
 * site kesilmez (nginx dosyaları yalnız reload'da okur).
 * grep -R: sites-enabled'daki symlink'leri de izler (-r izlemez).
 */
export function buildNginxCommandsText(domain: string): string {
  const file = `/etc/nginx/sites-available/${domain}`;
  return [
    "# 1) Yapılandırmayı bu dosyaya yapıştırın ve etkinleştirin",
    `nano ${file}`,
    `ln -s ${file} /etc/nginx/sites-enabled/`,
    "",
    "# 2) Bu domain'in ESKİ blokları başka dosyada kaldı mı? Yeni dosya",
    "#    dışında çıkan her bloğu silin (certbot'un değiştirdiği eski blok",
    "#    dahil). Aynı server_name iki blokta olursa nginx yalnız ilkini kullanır.",
    `grep -Rn "${domain}" /etc/nginx/sites-enabled/`,
    "",
    "# 3) Sına ve yükle — çıktıda 'conflicting server name' uyarısı kalmamalı",
    "nginx -t && systemctl reload nginx",
  ].join("\n");
}

/** Eski domain'i sunucudan kaldırma (domain değişince / silinince). */
export function buildServerCleanupText(domain: string): string {
  return [
    `# 1) ${domain} bloklarını bulun ve silin. Panelin şablonuyla kurulduysa:`,
    `#    rm /etc/nginx/sites-enabled/${domain} /etc/nginx/sites-available/${domain}`,
    `grep -Rln "${domain}" /etc/nginx/sites-enabled/`,
    "",
    "# 2) Sına ve yükle",
    "nginx -t && systemctl reload nginx",
    "",
    "# 3) Sertifikayı EN SON silin — önce silinirse nginx -t eski sertifika",
    "#    yolunu bulamaz ve yükleme durur",
    `certbot delete --cert-name ${domain}`,
  ].join("\n");
}

/** Kurumun hazır metinleri. Domain'e bağlı olanlar custom domain yoksa null. */
export function buildSnippets(
  snapshot: Pick<SetupSnapshot, "tenant" | "rootDomain">,
  serverIp: string | null
): Record<SnippetId, Snippet | null> {
  const domain = snapshot.tenant.customDomain;
  return {
    dns: domain
      ? {
          id: "dns",
          title: "DNS kayıtları",
          note: `Müşterinin alan adını aldığı firmanın DNS panelinde. "@" = ${domain}. Bu adlarda AAAA kaydı varsa silinmeli.`,
          text: buildDnsRecordsText(serverIp),
          perLine: false,
        }
      : null,
    certbot: domain
      ? {
          id: "certbot",
          title: "Sertifika — sunucuda (DNS bu sunucuyu gösterdikten sonra)",
          note: null,
          text: buildCertbotText(domain),
          perLine: false,
        }
      : null,
    "nginx-config": domain
      ? {
          id: "nginx-config",
          title: `Nginx — /etc/nginx/sites-available/${domain}`,
          note: "Apex bloğunda www YOK; www ayrı blokta apex'e 301 verir. Sertifika adımından sonra.",
          text: buildNginxConfig(domain),
          perLine: false,
        }
      : null,
    "nginx-commands": domain
      ? {
          id: "nginx-commands",
          title: "Nginx — kurulum komutları (sunucuda)",
          note: null,
          text: buildNginxCommandsText(domain),
          perLine: false,
        }
      : null,
    supabase: domain
      ? {
          id: "supabase",
          title: "Supabase → Authentication → URL Configuration → Redirect URLs",
          note: "İlk satır ZORUNLU (şifre sıfırlama bu adrese döner). İkincisi savunma (www→apex 301 kurulmadan önce ya da bozulursa). Wildcard satırı custom domain'i kapsamaz.",
          text: buildSupabaseLines(domain).join("\n"),
          perLine: true,
        }
      : null,
    "supabase-wildcard": {
      id: "supabase-wildcard",
      title: "Supabase → Authentication → URL Configuration → Redirect URLs",
      note: "Tüm subdomain'ler için tek satır (platform ayarı, kurum başına değil).",
      text: buildSupabaseWildcardLine(snapshot.rootDomain),
      perLine: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Custom domain değişimi
// ---------------------------------------------------------------------------

export interface DomainChangeNotice {
  oldDomain: string;
  /** null = alan temizlendi. */
  newDomain: string | null;
  supabaseRemove: string[];
  supabaseAdd: string[];
  serverCleanup: string;
}

/**
 * Kayıt sonrası pencere içeriği. Yalnız ESKİ domain doluysa ve değiştiyse
 * (yenisi girildi ya da alan silindi) — ilk kez girilen domain'in adımları
 * zaten Kurulum Durumu'nda. Girdiler DB'deki normalize değerlerdir.
 *
 * Eski Supabase satırını silmek düzen değil GÜVENLİK meselesi: listede kalan
 * domain el değiştirirse, biri o adresi redirect_to verip kurum adminine
 * gerçek bir sıfırlama maili tetikleyebilir; tıklanırsa oturum o siteye gider.
 */
export function buildDomainChangeNotice(
  oldDomain: string | null,
  newDomain: string | null
): DomainChangeNotice | null {
  if (!oldDomain || oldDomain === newDomain) return null;
  return {
    oldDomain,
    newDomain,
    supabaseRemove: buildSupabaseLines(oldDomain),
    supabaseAdd: newDomain ? buildSupabaseLines(newDomain) : [],
    serverCleanup: buildServerCleanupText(oldDomain),
  };
}

// ---------------------------------------------------------------------------
// Yoklama sonuçlarını duruma çevirme
// ---------------------------------------------------------------------------

export interface Verdict {
  status: CheckStatus;
  detail: string;
}

function skippedOrFailed(code: string, what: string): Verdict {
  if (code === "DNS_NOT_READY" || code === "PRIVATE_ADDRESS") {
    return { status: "unknown", detail: `${upperFirst(describeConnectionError(code))}.` };
  }
  if (isTlsErrorCode(code)) {
    return {
      status: "unknown",
      detail: `Sertifika geçersiz olduğu için kontrol edilemedi (${describeTlsError(code)}).`,
    };
  }
  return { status: "unknown", detail: `${what} yoklanamadı: ${describeConnectionError(code)}.` };
}

/**
 * Uygulama bu adreste doğru kurumu mu açıyor? Middleware her yanıta
 * `x-tenant-slug` yazar — 200 + doğru slug; DNS + sertifika + Nginx +
 * custom_domain kaydını tek istekte uçtan uca kanıtlar.
 */
export function evaluateAppResponse(probe: HttpProbe, expectedSlug: string, origin: string): Verdict {
  if (!probe.ok) return skippedOrFailed(probe.code, origin);
  const { status, location, tenantSlug } = probe;
  if (status === 200) {
    if (tenantSlug === expectedSlug) {
      return { status: "ok", detail: `${origin} açılıyor, doğru kurum (${expectedSlug}).` };
    }
    if (tenantSlug) {
      return { status: "missing", detail: `${origin} başka bir kurumu açıyor (${tenantSlug}).` };
    }
    return {
      status: "missing",
      detail: `${origin} yanıt veriyor ama yanıt bu uygulamadan gelmiyor — Nginx bu adresi uygulamaya iletmiyor.`,
    };
  }
  if (status >= 300 && status < 400) {
    if (parseUrl(location, origin)?.pathname === TENANT_ERROR_PATH) {
      return {
        status: "missing",
        detail: "Uygulama bu adresi hiçbir kuruma eşleyemedi (kurum bulunamadı sayfasına yönlendiriyor).",
      };
    }
    return { status: "missing", detail: `Beklenmeyen yönlendirme: ${status} → ${location ?? "?"}.` };
  }
  if (status === 502 || status === 503 || status === 504) {
    return {
      status: "missing",
      detail: `Nginx uygulamaya ulaşamıyor (${status}) — proxy_pass adresi yanlış ya da uygulama çalışmıyor.`,
    };
  }
  return { status: "missing", detail: `${origin} beklenmeyen yanıt verdi: ${status}.` };
}

/** `from` adresi https://<toHost>'a KALICI (301/308) yönleniyor mu? */
export function evaluateRedirect(
  probe: HttpProbe,
  from: string,
  toHost: string,
  hintWhenServed = ""
): Verdict {
  if (!probe.ok) return skippedOrFailed(probe.code, from);
  const { status, location } = probe;
  const target = parseUrl(location, from);
  const targetOk = !!target && target.protocol === "https:" && target.host === toHost;
  if ((status === 301 || status === 308) && targetOk) {
    return { status: "ok", detail: `${from} → https://${toHost} (${status}).` };
  }
  if ((status === 302 || status === 307) && targetOk) {
    return {
      status: "warning",
      detail: `${from} geçici yönlendirme veriyor (${status}); kalıcı (301) olmalı.`,
    };
  }
  if (status >= 300 && status < 400) {
    return {
      status: "missing",
      detail: `${from} yanlış yere yönleniyor: ${location ?? "?"} (beklenen https://${toHost}).`,
    };
  }
  if (status === 200) {
    return {
      status: "missing",
      detail: `${from} kendi başına açılıyor; https://${toHost} adresine 301 vermeli.${hintWhenServed ? ` ${hintWhenServed}` : ""}`,
    };
  }
  return { status: "missing", detail: `${from} beklenmeyen yanıt verdi: ${status}.` };
}

/**
 * Supabase yoklaması (setup-probes.ts): geçersiz token + redirect_to.
 * Supabase hatayı redirect_to'ya yollar; adres Redirect URLs'te YOKSA Site
 * URL'e düşürür (GoTrue GetReferrer → IsRedirectURLValid; 11 Eylül'de canlı
 * ölçüldü). Location host'u = dönüş adresinin host'u ise satır var.
 */
export function evaluateSupabaseProbe(probe: HttpProbe, returnUrl: string): Verdict {
  if (!probe.ok) {
    return { status: "unknown", detail: `Supabase'e sorulamadı: ${describeConnectionError(probe.code)}.` };
  }
  if (probe.status === 429) {
    return {
      status: "unknown",
      detail: "Supabase istek sınırına takıldı — birkaç dakika sonra yeniden kontrol edin.",
    };
  }
  const expected = parseUrl(returnUrl);
  const got = parseUrl(probe.location);
  if (probe.status >= 300 && probe.status < 400 && expected && got) {
    if (got.host === expected.host) {
      return { status: "ok", detail: `Redirect URLs bu adresi kabul ediyor (${expected.host}).` };
    }
    return {
      status: "missing",
      detail: `Redirect URLs bu adresi kabul etmiyor — şifre sıfırlama linki ${got.origin} köküne düşüyor, şifre formu yerine anasayfa açılır.`,
    };
  }
  return { status: "unknown", detail: `Beklenmeyen Supabase yanıtı (${probe.status}).` };
}

/** Apex + www A kayıtları bu sunucuyu mu gösteriyor; yabancı AAAA var mı? */
export function evaluateDns(
  dns: DomainProbes["dns"],
  server: SetupProbeReport["server"],
  domain: string
): Verdict {
  if (!server.ipv4.ok || server.ipv4.addresses.length === 0) {
    return { status: "unknown", detail: "Sunucu IP'si belirlenemedi (kök domain çözülemedi)." };
  }
  const expected4 = server.ipv4.addresses;
  // Kök domain'in IPv6 cevabı alınamadıysa AAAA karşılaştırması yapılmaz.
  const expected6 = server.ipv6.ok ? server.ipv6.addresses : null;
  const problems: string[] = [];
  const unknowns: string[] = [];
  const hosts: Array<[string, DnsLookup, DnsLookup]> = [
    [domain, dns.apex4, dns.apex6],
    [`www.${domain}`, dns.www4, dns.www6],
  ];
  for (const [name, a4, a6] of hosts) {
    if (!a4.ok) {
      unknowns.push(`${name}: ${describeConnectionError(a4.code)}`);
    } else if (a4.addresses.length === 0) {
      problems.push(`${name} için A kaydı yok`);
    } else {
      const foreign = a4.addresses.filter((ip) => !expected4.includes(ip));
      if (foreign.length > 0) {
        problems.push(`${name} → ${foreign.join(", ")} (beklenen ${expected4.join(", ")})`);
      }
    }
    if (a6.ok && a6.addresses.length > 0 && expected6) {
      const foreign6 = a6.addresses.filter((ip) => !expected6.includes(ip));
      if (foreign6.length > 0) {
        problems.push(
          `${name} için AAAA kaydı başka adrese gidiyor (${foreign6.join(", ")}) — ` +
            (expected6.length === 0
              ? "silinmeli, platform IPv6 kullanmıyor"
              : `beklenen ${expected6.join(", ")}`)
        );
      }
    }
  }
  if (problems.length > 0) return { status: "missing", detail: `${problems.join("; ")}.` };
  if (unknowns.length > 0) return { status: "unknown", detail: `${unknowns.join("; ")}.` };
  return { status: "ok", detail: `${domain} ve www → ${expected4.join(", ")}.` };
}

/**
 * Sertifika geçerli mi, kaç gün kaldı? autoRenew: müşteri sertifikaları
 * certbot ile kendiliğinden yenilenir; platform wildcard'ı YENİLENMEZ
 * (manuel DNS-01 — NOTE.md).
 */
export function evaluateCert(
  parts: Array<{ host: string; probe: TlsProbe }>,
  now: number,
  autoRenew: boolean
): Verdict {
  const problems: string[] = [];
  const unknowns: string[] = [];
  let minDays: number | null = null;
  let validTo: string | null = null;
  for (const { host, probe } of parts) {
    if (!probe.ok) {
      if (probe.code === "DNS_NOT_READY" || probe.code === "PRIVATE_ADDRESS") {
        unknowns.push(`${host}: ${describeConnectionError(probe.code)}`);
      } else {
        unknowns.push(`${host}: 443 portuna bağlanılamadı (${describeConnectionError(probe.code)})`);
      }
      continue;
    }
    if (!probe.authorized) {
      problems.push(`${host}: ${describeTlsError(probe.authorizationError ?? "?")}`);
      continue;
    }
    if (probe.validTo) {
      const d = daysUntil(probe.validTo, now);
      if (d !== null && (minDays === null || d < minDays)) {
        minDays = d;
        validTo = probe.validTo;
      }
    }
  }
  if (problems.length > 0) return { status: "missing", detail: `${problems.join("; ")}.` };
  if (unknowns.length > 0) return { status: "unknown", detail: `${unknowns.join("; ")}.` };
  if (minDays === null || !validTo) return { status: "ok", detail: "Geçerli." };
  const when = `bitiş ${formatTrDate(validTo)} (${minDays} gün)`;
  if (minDays < CERT_WARN_DAYS) {
    return {
      status: "warning",
      detail: autoRenew
        ? `Geçerli ama ${when} — certbot 30 gün kala yeniler, yenileme çalışmıyor olabilir: certbot renew --dry-run`
        : `Geçerli ama ${when} — kendiliğinden yenilenmez, hemen yenilenmeli (NOTE.md).`,
    };
  }
  return {
    status: "ok",
    detail: autoRenew
      ? `Geçerli, ${when}. certbot kendiliğinden yeniler.`
      : `Geçerli, ${when}. Kendiliğinden YENİLENMEZ — bitişten önce elle yenilenmeli (NOTE.md).`,
  };
}

/** Bileşik madde: parçalardan en kötüsü (Eksik > Uyarı > Belirlenemedi > Tamam). */
export function combineVerdicts(parts: Verdict[]): Verdict {
  const rank: Record<CheckStatus, number> = {
    missing: 5,
    warning: 4,
    unknown: 3,
    pending: 2,
    info: 1,
    ok: 0,
  };
  const worst = parts.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a), parts[0]);
  return { status: worst.status, detail: parts.map((p) => p.detail).join(" ") };
}

// ---------------------------------------------------------------------------
// Tüm liste
// ---------------------------------------------------------------------------

export interface EvaluateInput {
  snapshot: SetupSnapshot;
  /** undefined = yoklama sürüyor; null = yoklama isteği başarısız. */
  probes: SetupProbeReport | null | undefined;
  now: number;
}

export interface SetupEvaluation {
  groups: CheckGroup[];
  counts: { missing: number; warning: number; unknown: number; pending: number };
}

function item(
  id: string,
  label: string,
  verdict: Verdict,
  snippets: SnippetId[] = []
): CheckItem {
  return { id, label, status: verdict.status, detail: verdict.detail, snippets };
}

const PENDING: Verdict = { status: "pending", detail: "Kontrol ediliyor…" };
const PROBE_FAILED: Verdict = {
  status: "unknown",
  detail: "Canlı kontrol yapılamadı — yeniden kontrol edin.",
};
const LOCAL_DEV: Verdict = {
  status: "unknown",
  detail: "Yerel geliştirme ortamı — DNS, sertifika ve Nginx yalnız canlıda yoklanır.",
};

function evaluateKurum(
  snapshot: SetupSnapshot,
  probes: EvaluateInput["probes"],
  now: number
): CheckGroup {
  const { slug, isActive } = snapshot.tenant;
  const host = `${slug}.${snapshot.rootDomain}`;
  const origin = `https://${host}`;
  const items: CheckItem[] = [
    item(
      "kurum-aktif",
      "Kurum aktif",
      isActive
        ? { status: "ok", detail: "Site ve panel erişime açık." }
        : {
            status: "warning",
            detail: "Kurum pasif — site ve panel erişime kapalı; canlı kontroller bu yüzden başarısız olabilir.",
          }
    ),
  ];

  let access: Verdict;
  let cert: Verdict;
  let supabase: Verdict;
  if (probes === undefined) {
    access = cert = supabase = PENDING;
  } else if (probes === null) {
    access = cert = supabase = PROBE_FAILED;
  } else if (!probes.subdomain) {
    access = cert = supabase = LOCAL_DEV;
  } else {
    access = evaluateAppResponse(probes.subdomain.http, slug, origin);
    cert = evaluateCert([{ host, probe: probes.subdomain.tls }], now, false);
    supabase = evaluateSupabaseProbe(probes.subdomain.supabase, `${origin}${AUTH_RETURN_PATH}`);
  }
  items.push(
    item("subdomain-erisim", `Subdomain adresi (${host})`, access),
    item("subdomain-sertifika", "Platform sertifikası (wildcard)", cert),
    item(
      "subdomain-supabase",
      "Şifre sıfırlama dönüş adresi (subdomain)",
      supabase,
      supabase.status === "missing" ? ["supabase-wildcard"] : []
    )
  );
  return { id: "kurum", title: "Kurum ve subdomain", note: null, items };
}

function evaluateAdmins(admins: SetupAdmin[] | null, now: number): CheckGroup {
  const items: CheckItem[] = [];
  if (admins === null) {
    items.push(
      item("admin-davet", "Admin davet edildi", {
        status: "unknown",
        detail: "Admin listesi okunamadı.",
      })
    );
  } else if (admins.length === 0) {
    items.push(
      item("admin-davet", "Admin davet edildi", {
        status: "missing",
        detail: "Kurumun admini yok — aşağıdaki Tenant Admin Kullanıcıları bölümünden ekleyin.",
      })
    );
  } else {
    items.push(
      item("admin-davet", "Admin davet edildi", {
        status: "ok",
        detail: `${admins.length} admin: ${admins.map((a) => a.email || "(e-posta yok)").join(", ")}.`,
      })
    );
    const signedIn = admins.filter((a) => a.lastSignInAt);
    const waiting = admins.filter((a) => !a.lastSignInAt);
    if (signedIn.length > 0) {
      items.push(
        item("admin-giris", "Davet kabul edildi (ilk giriş)", {
          status: "ok",
          detail:
            `Giriş yapan: ${signedIn.map((a) => a.email).join(", ")}.` +
            (waiting.length > 0
              ? ` Henüz giriş yapmayan: ${waiting.map((a) => a.email).join(", ")}.`
              : ""),
        })
      );
    } else {
      const invited = admins
        .map((a) => a.invitedAt)
        .filter((d): d is string => !!d)
        .sort()
        .pop();
      const when = invited ? ` (davet: ${formatTrDate(invited)}, ${formatAgo(invited, now)})` : "";
      items.push(
        item("admin-giris", "Davet kabul edildi (ilk giriş)", {
          status: "warning",
          detail: `Henüz kimse giriş yapmadı${when}. Davet bağlantısının süresi dolduysa kişiyi kaldırıp yeniden ekleyin — yeni davet maili gider.`,
        })
      );
    }
  }
  return { id: "admin", title: "Admin", note: null, items };
}

function evaluateDomain(
  snapshot: SetupSnapshot,
  probes: EvaluateInput["probes"],
  now: number
): CheckGroup {
  const domain = snapshot.tenant.customDomain;
  if (!domain) {
    return {
      id: "domain",
      title: "Custom domain",
      note: null,
      items: [
        item("domain-yok", "Custom domain yok", {
          status: "info",
          detail:
            "Kurum yalnız subdomain adresinde çalışır. Bağlanacaksa önce Custom Domain alanına yazıp kaydedin — adımlar ve hazır metinler burada o domain için belirir.",
        }),
      ],
    };
  }

  const www = `www.${domain}`;
  let dns: Verdict;
  let cert: Verdict;
  let nginx: Verdict;
  let redirects: Verdict;
  let supabase: Verdict;
  const d = probes ? probes.domain : null;
  if (probes === undefined) {
    dns = cert = nginx = redirects = supabase = PENDING;
  } else if (probes === null || !d || d.domain !== domain) {
    dns = cert = nginx = redirects = supabase = PROBE_FAILED;
  } else if (probes.localDev) {
    // Supabase yoklaması sunucudan bağımsız — yerelde de gerçek sonuç verir.
    dns = cert = nginx = redirects = LOCAL_DEV;
    supabase = evaluateSupabaseProbe(d.supabase, `https://${domain}${AUTH_RETURN_PATH}`);
  } else {
    dns = evaluateDns(d.dns, probes.server, domain);
    cert = evaluateCert(
      [
        { host: domain, probe: d.tlsApex },
        { host: www, probe: d.tlsWww },
      ],
      now,
      true
    );
    nginx = evaluateAppResponse(d.httpsApex, snapshot.tenant.slug, `https://${domain}`);
    redirects = combineVerdicts([
      evaluateRedirect(
        d.httpsWww,
        `https://${www}`,
        domain,
        "Apex bloğunun server_name satırında www var ya da www→apex bloğu yok."
      ),
      evaluateRedirect(d.httpApex, `http://${domain}`, domain),
    ]);
    supabase = evaluateSupabaseProbe(d.supabase, `https://${domain}${AUTH_RETURN_PATH}`);
  }
  return {
    id: "domain",
    title: `Custom domain — ${domain}`,
    note: "Sıra: DNS → sertifika → Nginx → Supabase. Custom domain alanı zaten kayıtlı.",
    items: [
      item("domain-dns", "DNS A kayıtları (apex + www)", dns, ["dns"]),
      item("domain-sertifika", "SSL sertifikası (apex + www)", cert, ["certbot"]),
      item("domain-nginx", "Nginx apex bloğu (site açılıyor)", nginx, [
        "nginx-config",
        "nginx-commands",
      ]),
      item("domain-yonlendirme", "www → apex ve http → https yönlendirmesi", redirects, [
        "nginx-config",
        "nginx-commands",
      ]),
      item("domain-supabase", "Supabase dönüş adresi (şifre sıfırlama)", supabase, ["supabase"]),
    ],
  };
}

function evaluateContent(snapshot: SetupSnapshot): CheckGroup {
  const { settings, counts } = snapshot;
  const unread: Verdict = { status: "unknown", detail: "Okunamadı." };

  let logo: Verdict = unread;
  let contact: Verdict = unread;
  if (settings) {
    const logoUrl = (settings.logo_url ?? "").trim();
    logo =
      !logoUrl || logoUrl === PLACEHOLDER_LOGO_URL
        ? { status: "info", detail: "Varsayılan logo duruyor (Site Ayarları)." }
        : { status: "ok", detail: "Yüklendi." };
    const empty: string[] = [];
    if (!(settings.contact_phone ?? "").trim()) empty.push("telefon");
    if (!(settings.contact_address ?? "").trim()) empty.push("adres");
    contact =
      empty.length === 0
        ? { status: "ok", detail: "Telefon ve adres girildi." }
        : { status: "info", detail: `Boş: ${empty.join(", ")} (Site Ayarları).` };
  }

  const count = (n: number | null, whenZero: Verdict, unit: string): Verdict =>
    n === null ? unread : n === 0 ? whenZero : { status: "ok", detail: `${n} ${unit}.` };

  return {
    id: "icerik",
    title: "Kurum admininin işleri",
    note: "Bilgi amaçlı — bunları kurum admini kendi panelinden yapar.",
    items: [
      item("icerik-logo", "Logo", logo),
      item("icerik-iletisim", "İletişim bilgileri", contact),
      item(
        "icerik-kategori",
        "Haber Kategorileri",
        count(
          counts.categories,
          { status: "info", detail: "Kategori yok — kurulum kategori oluşturmaz, kurum admini ekler." },
          "kategori"
        )
      ),
      item(
        "icerik-menu",
        "Site Menüsü",
        count(counts.menuItems, { status: "info", detail: "Menü boş." }, "öğe")
      ),
      item(
        "icerik-anasayfa",
        "Anasayfa Bölümleri",
        count(
          counts.homepageSections,
          { status: "warning", detail: "Bölüm yok — public anasayfa boş görünür." },
          "bölüm"
        )
      ),
    ],
  };
}

export function evaluateSetup({ snapshot, probes, now }: EvaluateInput): SetupEvaluation {
  const groups = [
    evaluateKurum(snapshot, probes, now),
    evaluateAdmins(snapshot.admins, now),
    evaluateDomain(snapshot, probes, now),
    evaluateContent(snapshot),
  ];
  const counts = { missing: 0, warning: 0, unknown: 0, pending: 0 };
  for (const g of groups) {
    for (const i of g.items) {
      if (i.status === "missing") counts.missing++;
      else if (i.status === "warning") counts.warning++;
      else if (i.status === "unknown") counts.unknown++;
      else if (i.status === "pending") counts.pending++;
    }
  }
  return { groups, counts };
}

export type SummaryTone = "ok" | "missing" | "warning" | "pending";

/** Başlık satırı özeti: "2 eksik · 1 uyarı" / "Tamam" / "Kontrol ediliyor…". */
export function summarizeSetup(counts: SetupEvaluation["counts"]): {
  tone: SummaryTone;
  text: string;
} {
  const parts: string[] = [];
  if (counts.missing > 0) parts.push(`${counts.missing} eksik`);
  if (counts.warning > 0) parts.push(`${counts.warning} uyarı`);
  const tone: SummaryTone =
    counts.missing > 0
      ? "missing"
      : counts.warning > 0
        ? "warning"
        : counts.pending > 0
          ? "pending"
          : "ok";
  if (parts.length === 0) {
    return { tone, text: counts.pending > 0 ? "Kontrol ediliyor…" : "Tamam" };
  }
  return { tone, text: parts.join(" · ") + (counts.pending > 0 ? " · kontrol sürüyor" : "") };
}
