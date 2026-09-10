/**
 * Kurulum Durumu — CANLI yoklamalar (11 Eylül 2026).
 *
 * Ağ işleri (DNS, TLS, fetch) DIŞARIDAN verilir (ProbeDeps): route gerçek
 * Node bağımlılıklarını (setup-probe-deps.ts), test sahtelerini geçer. Bu
 * dosya import'suz (yalnız tip importu) — Node test script'i doğrudan alır.
 * Sonuçları duruma çeviren taraf: setup-checklist.ts (evaluateSetup).
 *
 * GÜVENLİK (SSRF): yoklanan host HER ZAMAN DB'den gelir (route yalnız
 * tenantId alır; custom_domain yazılırken CUSTOM_DOMAIN_REGEX ile doğrulanmış),
 * yalnız süper admin çağırır, istekler sabit yollara ve yalnız 80/443'e gider,
 * cevap gövdesi okunmaz. Alan adı özel/yerel bir IP'ye çözülüyorsa HİÇ
 * bağlanılmaz ("PRIVATE_ADDRESS").
 *
 * DNS KAPISI: host'un A kaydı bu sunucuyu (kök domain'in A kaydı) göstermiyorsa
 * o host'a TLS/HTTP yoklaması YAPILMAZ ("DNS_NOT_READY") — başkasının
 * sunucusunu ölçüp yanıltıcı sonuç vermemek için.
 *
 * SUPABASE YOKLAMASI: GET /auth/v1/verify?type=recovery&token=<geçersiz>
 * &redirect_to=<dönüş adresi>, yönlendirme takip edilmeden. Geçersiz token'da
 * Supabase hatayı redirect_to'ya yollar; adres Redirect URLs'te YOKSA Site
 * URL'e düşürür (GoTrue GetReferrer → IsRedirectURLValid). 11 Eylül 2026
 * canlı ölçüm: listedeki adres → 303, Location aynı host; listede olmayan →
 * 303 https://buyukdirilis.org.tr#error=… Yan etkisi yok: kullanıcıya
 * dokunmaz, mail göndermez (Supabase loglarında başarısız doğrulama olarak
 * görünür). apikey gerekmez — maildeki link de anahtarsız açılır.
 */
import type {
  DnsLookup,
  DomainProbes,
  HttpProbe,
  SetupProbeReport,
  SubdomainProbes,
  TlsProbe,
} from "./setup-checklist";

/** setup-checklist.ts AUTH_RETURN_PATH ile AYNI (test karşılaştırır). */
export const SUPABASE_RETURN_PATH = "/admin/davet-kabul";

/** Yoklanan uygulama sayfası: giriş istemez, middleware x-tenant-slug yazar. */
export const PROBE_PAGE_PATH = "/admin/giris";

/** Supabase yoklamasındaki bilerek geçersiz token (hiçbir hesaba denk gelmez). */
export const PROBE_INVALID_TOKEN = "kurulum-kontrolu-gecersiz-token";

export interface RawHttpResponse {
  status: number;
  location: string | null;
  tenantSlug: string | null;
}

export interface RawTlsResult {
  authorized: boolean;
  authorizationError: string | null;
  validTo: string | null;
}

export interface ProbeDeps {
  resolve4(host: string): Promise<string[]>;
  resolve6(host: string): Promise<string[]>;
  /** Yönlendirme takip ETMEDEN GET; hata fırlatırsa kodu probeErrorCode okur. */
  httpGet(url: string): Promise<RawHttpResponse>;
  tlsCert(host: string): Promise<RawTlsResult>;
}

export interface ProbeTarget {
  slug: string;
  rootDomain: string;
  customDomain: string | null;
  supabaseUrl: string | null;
}

/** Yerel geliştirme kökü mü? (lvh.me → 127.0.0.1; "bu sunucu" canlı değil) */
export function isLocalRootDomain(root: string): boolean {
  return (
    root === "lvh.me" ||
    root.endsWith(".lvh.me") ||
    root === "localhost" ||
    root.endsWith(".localhost") ||
    root === "127.0.0.1"
  );
}

export function isPublicIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((p) => !/^[0-9]{1,3}$/.test(p))) return false;
  const nums = parts.map(Number);
  if (nums.some((n) => n > 255)) return false;
  const [a, b] = nums;
  if (a === 0 || a === 10 || a === 127) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false; // link-local
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a >= 224) return false; // multicast + ayrılmış
  return true;
}

export function isPublicIPv6(ip: string): boolean {
  const s = ip.toLowerCase();
  if (!s.includes(":")) return false;
  if (s === "::" || s === "::1") return false;
  if (/^fe[89ab]/.test(s)) return false; // fe80::/10 link-local
  if (/^f[cd]/.test(s)) return false; // fc00::/7 unique-local
  if (s.startsWith("ff")) return false; // multicast
  if (s.startsWith("::ffff:")) return isPublicIPv4(s.slice(7));
  return true;
}

/** Yoklama hatasını tek koda indirger (undici: err.cause.code; zaman aşımı). */
export function probeErrorCode(err: unknown): string {
  const e = err as { code?: unknown; name?: unknown; cause?: { code?: unknown } } | null;
  if (e && typeof e.code === "string") return e.code;
  if (e?.cause && typeof e.cause.code === "string") return e.cause.code;
  if (e?.name === "TimeoutError" || e?.name === "AbortError") return "TIMEOUT";
  return "ERROR";
}

export function buildSupabaseProbeUrl(supabaseUrl: string, returnUrl: string): string {
  const u = new URL("/auth/v1/verify", supabaseUrl);
  u.searchParams.set("type", "recovery");
  u.searchParams.set("token", PROBE_INVALID_TOKEN);
  u.searchParams.set("redirect_to", returnUrl);
  return u.toString();
}

/** Host yoklanabilir mi? null = evet; aksi halde atlama kodu. */
export function gateHost(
  a4: DnsLookup,
  a6: DnsLookup,
  server4: DnsLookup
): "DNS_NOT_READY" | "PRIVATE_ADDRESS" | null {
  if (!a4.ok || a4.addresses.length === 0) return "DNS_NOT_READY";
  if (a4.addresses.some((ip) => !isPublicIPv4(ip))) return "PRIVATE_ADDRESS";
  if (a6.ok && a6.addresses.some((ip) => !isPublicIPv6(ip))) return "PRIVATE_ADDRESS";
  // Sunucu IP'si bilinmiyorsa kapı uygulanmaz (DNS maddesi zaten Belirlenemedi).
  if (server4.ok && server4.addresses.length > 0) {
    if (a4.addresses.some((ip) => !server4.addresses.includes(ip))) return "DNS_NOT_READY";
  }
  return null;
}

// "Kayıt yok" kesin cevaptır (boş liste); diğer hatalar "cevap alınamadı".
const NO_RECORD = new Set(["ENOTFOUND", "ENODATA"]);

async function lookup(
  fn: (host: string) => Promise<string[]>,
  host: string
): Promise<DnsLookup> {
  try {
    return { ok: true, addresses: await fn(host) };
  } catch (err) {
    const code = probeErrorCode(err);
    return NO_RECORD.has(code) ? { ok: true, addresses: [] } : { ok: false, code };
  }
}

async function http(deps: ProbeDeps, url: string): Promise<HttpProbe> {
  try {
    const r = await deps.httpGet(url);
    return { ok: true, status: r.status, location: r.location, tenantSlug: r.tenantSlug };
  } catch (err) {
    return { ok: false, code: probeErrorCode(err) };
  }
}

async function tls(deps: ProbeDeps, host: string): Promise<TlsProbe> {
  try {
    const r = await deps.tlsCert(host);
    return {
      ok: true,
      authorized: r.authorized,
      authorizationError: r.authorizationError,
      validTo: r.validTo,
    };
  } catch (err) {
    return { ok: false, code: probeErrorCode(err) };
  }
}

function skipped(code: string): Promise<{ ok: false; code: string }> {
  return Promise.resolve({ ok: false, code });
}

/**
 * Tüm yoklamalar. Hiçbir zaman fırlatmaz: her parça kendi sonucunu (ya da
 * hata kodunu) taşır. Bağımsız parçalar paralel; TLS/HTTP yalnız DNS kapısı
 * geçilince başlar. Toplam süre ≈ DNS + tek yoklamanın zaman aşımı.
 */
export async function runSetupProbes(
  target: ProbeTarget,
  deps: ProbeDeps,
  now: Date = new Date()
): Promise<SetupProbeReport> {
  const { slug, rootDomain, customDomain, supabaseUrl } = target;
  const supabaseProbe = (returnUrl: string): Promise<HttpProbe> =>
    supabaseUrl
      ? http(deps, buildSupabaseProbeUrl(supabaseUrl, returnUrl))
      : skipped("NO_SUPABASE_URL");

  // Yerel geliştirme: kök lvh.me → "bu sunucu" 127.0.0.1; canlı domain'leri
  // ona göre ölçmek yanıltır. Yalnız Supabase yoklaması (sunucudan bağımsız).
  if (isLocalRootDomain(rootDomain)) {
    const skip = { ok: false as const, code: "LOCAL_DEV" };
    return {
      checkedAt: now.toISOString(),
      rootDomain,
      localDev: true,
      server: { ipv4: skip, ipv6: skip },
      subdomain: null,
      domain: customDomain
        ? {
            domain: customDomain,
            dns: { apex4: skip, www4: skip, apex6: skip, www6: skip },
            tlsApex: skip,
            tlsWww: skip,
            httpsApex: skip,
            httpsWww: skip,
            httpApex: skip,
            supabase: await supabaseProbe(`https://${customDomain}${SUPABASE_RETURN_PATH}`),
          }
        : null,
    };
  }

  const subHost = `${slug}.${rootDomain}`;
  const www = customDomain ? `www.${customDomain}` : null;

  // 1) Birbirinden bağımsız olanlar hemen başlar.
  const serverP = Promise.all([
    lookup(deps.resolve4, rootDomain),
    lookup(deps.resolve6, rootDomain),
  ]);
  const subDnsP = Promise.all([lookup(deps.resolve4, subHost), lookup(deps.resolve6, subHost)]);
  const subSupabaseP = supabaseProbe(`https://${subHost}${SUPABASE_RETURN_PATH}`);
  const domainDnsP =
    customDomain && www
      ? Promise.all([
          lookup(deps.resolve4, customDomain),
          lookup(deps.resolve4, www),
          lookup(deps.resolve6, customDomain),
          lookup(deps.resolve6, www),
        ])
      : null;
  const domainSupabaseP = customDomain
    ? supabaseProbe(`https://${customDomain}${SUPABASE_RETURN_PATH}`)
    : null;

  const [server4, server6] = await serverP;

  // 2) Subdomain: DNS kapısından sonra TLS + uygulama yanıtı.
  const [sub4, sub6] = await subDnsP;
  const subGate = gateHost(sub4, sub6, server4);
  const subHttpP = subGate
    ? skipped(subGate)
    : http(deps, `https://${subHost}${PROBE_PAGE_PATH}`);
  const subTlsP = subGate ? skipped(subGate) : tls(deps, subHost);

  // 3) Custom domain: apex ve www ayrı kapılardan.
  let domain: DomainProbes | null = null;
  if (customDomain && www && domainDnsP && domainSupabaseP) {
    const [apex4, www4, apex6, www6] = await domainDnsP;
    const apexGate = gateHost(apex4, apex6, server4);
    const wwwGate = gateHost(www4, www6, server4);
    const [tlsApex, tlsWww, httpsApex, httpsWww, httpApex, supabase] = await Promise.all([
      apexGate ? skipped(apexGate) : tls(deps, customDomain),
      wwwGate ? skipped(wwwGate) : tls(deps, www),
      apexGate ? skipped(apexGate) : http(deps, `https://${customDomain}${PROBE_PAGE_PATH}`),
      wwwGate ? skipped(wwwGate) : http(deps, `https://${www}/`),
      apexGate ? skipped(apexGate) : http(deps, `http://${customDomain}/`),
      domainSupabaseP,
    ]);
    domain = {
      domain: customDomain,
      dns: { apex4, www4, apex6, www6 },
      tlsApex,
      tlsWww,
      httpsApex,
      httpsWww,
      httpApex,
      supabase,
    };
  }

  const [subHttp, subTls, subSupabase] = await Promise.all([subHttpP, subTlsP, subSupabaseP]);
  const subdomain: SubdomainProbes = {
    host: subHost,
    dns: sub4,
    http: subHttp,
    tls: subTls,
    supabase: subSupabase,
  };

  return {
    checkedAt: now.toISOString(),
    rootDomain,
    localDev: false,
    server: { ipv4: server4, ipv6: server6 },
    subdomain,
    domain,
  };
}
