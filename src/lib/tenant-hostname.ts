/**
 * Hostname Parse + Tenant URL Helper'lari
 * ---------------------------------------
 * Saf string fonksiyonu — Edge runtime, Server Component'ler ve
 * Client component'lerin uchunde de guvenle calisir. DB veya
 * next/headers gibi runtime bagimliliklari YOK.
 *
 * Apex domain (root domain) NEXT_PUBLIC_ROOT_DOMAIN env'inden
 * okunur. Fallback: "lvh.me" (lokal gelistirme default'u).
 *
 * PRODUCTION (VPS — Vercel kullanilmiyor):
 *   NEXT_PUBLIC_ROOT_DOMAIN=buyukdirilis.org.tr
 *
 * ⚠️ Bu deger BUILD ORTAMINDA set edilmelidir. NEXT_PUBLIC_* degiskenleri
 * build aninda bundle'a gomulur; sunucudaki .env dosyasi client bundle'i
 * ETKILEMEZ. Build WSL'de alindigi icin dogru degerin WSL'deki .env'de
 * olmasi gerekir — aksi halde canli site lokal fallback'e ("lvh.me")
 * duser. Dogrulama: grep -o "buyukdirilis.org.tr" .next/static/chunks/*.js
 * (ayrinti: NOTE.md → VPS DEPLOY, 4. bolum Tuzak 2)
 */

const ROOT_DOMAIN_FALLBACK = "lvh.me";

/**
 * Apex domain'i env'den okur, port kismini temizler.
 * lvh.me:3000 -> lvh.me
 * buyukdirilis.org.tr -> buyukdirilis.org.tr
 *
 * Export: hostname'i PARSE eden taraf (parseHostname) ile URL INSA eden
 * taraf (buildTenantAdminUrl) ayni apex kaynagini kullansin diye.
 * Apex'i host string'inden tahmin etmek (split(".").slice(-2)) coklu
 * parcali TLD'lerde yanlis sonuc verir: buyukdirilis.org.tr -> "org.tr".
 */
export function getRootDomain(): string {
  const raw = process.env.NEXT_PUBLIC_ROOT_DOMAIN || ROOT_DOMAIN_FALLBACK;
  return raw.split(":")[0].toLowerCase();
}

/**
 * Tenant'in admin paneline cross-subdomain URL insa eder.
 *
 * Oncelik: custom_domain > {slug}.{apex}
 *
 * Apex host string'inden TAHMIN EDILMEZ, getRootDomain() ile env'den
 * okunur. Tahmin (host.split(".").slice(-2)) coklu parcali TLD'lerde
 * yanlis sonuc uretiyordu:
 *   buyukdirilis.org.tr -> "org.tr" -> https://default.org.tr/admin (DNS yok)
 *   dogrusu             -> https://default.buyukdirilis.org.tr/admin
 *
 * Port window'dan alinir: dev'de lvh.me:3000 korunur, prod'da port yok.
 * Bu fonksiyon parseHostname ile AYNI apex kaynagini kullanir; parse ve
 * insa taraflarinin ayrisamamasi icin bilerek ayni dosyada durur.
 *
 * Client-only (window'a bagimli) — SSR sirasinda "#" doner. Server
 * tarafinda public URL icin bkz. lib/tenant-url.ts buildTenantPublicUrl.
 */
export function buildTenantAdminUrl(
  slug: string,
  customDomain?: string | null
): string {
  if (typeof window === "undefined") return "#";

  // Custom domain varsa onu kullan (production'da oncelik)
  if (customDomain) {
    return `https://${customDomain}/admin`;
  }

  const { protocol, host } = window.location;
  const port = host.split(":")[1];

  return `${protocol}//${slug}.${getRootDomain()}${port ? `:${port}` : ""}/admin`;
}

/**
 * Hostname parse sonucu — uc kategori:
 *  - apex: root domain'in kendisi (sendika-site.vercel.app, lvh.me)
 *    veya localhost/127.0.0.1/www.{apex}
 *  - subdomain: {slug}.{apex} formatinda (test-abc.lvh.me)
 *  - custom_domain: ne apex ne subdomain — DB'de tenants.custom_domain
 *    lookup adayi
 */
export type HostnameMatch =
  | { type: "apex" }
  | { type: "subdomain"; slug: string }
  | { type: "custom_domain"; host: string };

/**
 * Hostname'i parse eder, hangi kategoride oldugunu belirler.
 *
 * Edge case'ler:
 * - Port (lvh.me:3000) otomatik temizlenir
 * - www. prefix'i apex sayilir
 * - localhost/127.0.0.1 apex sayilir
 * - .vercel.app deployment preview'lari (xxx-suleyman.vercel.app)
 *   apex sayilir (slug parse edilmez)
 *
 * @param hostname Request.headers.get("host") veya window.location.hostname
 * @returns HostnameMatch — type'a gore handle edilir
 */
export function parseHostname(hostname: string): HostnameMatch {
  // 1) Port temizle, kucuk harfe cevir
  const host = hostname.split(":")[0].toLowerCase().trim();

  // 2) localhost / 127.0.0.1 → apex
  if (host === "localhost" || host === "127.0.0.1" || host === "") {
    return { type: "apex" };
  }

  const rootDomain = getRootDomain();

  // 3) Apex'in kendisi → apex
  if (host === rootDomain) {
    return { type: "apex" };
  }

  // 4) www.{apex} → apex
  if (host === `www.${rootDomain}`) {
    return { type: "apex" };
  }

  // 5) {slug}.{apex} → subdomain
  //    Apex'in tam endsWith kontrolu, sub kismi bos olmamali
  const apexSuffix = `.${rootDomain}`;
  if (host.endsWith(apexSuffix)) {
    const sub = host.slice(0, host.length - apexSuffix.length);
    if (sub && sub !== "www") {
      // Coklu parca slug'lari kabul etmiyoruz (ornek: a.b.lvh.me)
      // Sadece tek seviye subdomain
      if (!sub.includes(".")) {
        return { type: "subdomain", slug: sub };
      }
    }
  }

  // 6) Vercel preview deployment'lari (.vercel.app endsWith ama
  //    root_domain'den farkli olabilir, ornek: pr-1-suleyman.vercel.app)
  //    Bunlari apex say (gercek subdomain degil)
  if (host.endsWith(".vercel.app")) {
    return { type: "apex" };
  }

  // 7) Ne apex ne subdomain → custom_domain adayi
  //    (Asama A'da default'a duser; Asama B'de DB lookup yapilacak)
  return { type: "custom_domain", host };
}

/**
 * Backward-compat wrapper.
 * Mevcut middleware/useTenant/tenant.ts kullanim sekli aynen calismaya
 * devam etsin diye eski imza ile slug doner.
 *
 * - apex / custom_domain → "default"
 * - subdomain → slug
 *
 * NOT: custom_domain adaylari su an default'a duser. Asama B'de
 * middleware bu durumu DB lookup ile cozecek (header'a tenant.slug
 * yazilarak).
 */
export function extractSlugFromHostname(hostname: string): string {
  const match = parseHostname(hostname);
  switch (match.type) {
    case "apex":
      return "default";
    case "subdomain":
      return match.slug;
    case "custom_domain":
      // Asama A'da default'a duser (mevcut davranis korunur)
      return "default";
  }
}
