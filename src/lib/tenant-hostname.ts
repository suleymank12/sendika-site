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
 * "www." on ekini soyar.
 *
 * KURAL: host "www." ile BASLIYOR **ve** kalan kisimda HALA nokta varsa
 * soyulur. Ikinci kosul olmadan "www.com" gibi patolojik girdiler "com"a
 * donerdi; "www" (noktasiz tek etiket) ise hic dokunulmaz.
 *
 * TEK SEVIYE soyar (www.www.x -> www.x). Ozyineleme BILEREK yok: gercek
 * dunyada www.www yoktur, gelirse de ust katmanlar guvenli tarafa
 * (custom_domain -> default) duser.
 *
 * "www" adinda bir tenant slug'i ile CAKISMAZ: constants.ts
 * RESERVED_TENANT_SLUGS icinde "www" var, create/update-tenant reddediyor.
 */
function stripWww(host: string): string {
  if (!host.startsWith("www.")) return host;
  const rest = host.slice(4);
  return rest.includes(".") ? rest : host;
}

/**
 * tenants.custom_domain icin YAZMA tarafi normalizasyonu
 * (create-tenant / update-tenant bunu kullanir).
 *
 * NEDEN GEREKLI: parseHostname okuma tarafinda www'yu soyar, yani DB
 * lookup'i HER ZAMAN apex formuyla yapilir. DB'ye "www.example.com"
 * yazilirsa o kayit BIR DAHA BULUNAMAZ (tenant default'a duser).
 * Iki taraf ayni kurali (stripWww) kullanmali — DB'de daima apex formu
 * dursun. Invariant: normalizeCustomDomain(h) === parseHostname(h).host
 * (custom_domain case'inde).
 *
 * @returns normalize edilmis domain; bos/string olmayan girdide null
 */
export function normalizeCustomDomain(
  input: string | null | undefined
): string | null {
  if (typeof input !== "string") return null;
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  return stripWww(trimmed) || null;
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
 * - "www." on eki GIRISTE soyulur (stripWww) — apex, subdomain ve
 *   custom_domain'in UCUNDE birden gecerli. Onceden yalnizca www.{apex}
 *   ele alinirdi; www.{custom_domain} DB'de eslesmeyip default'a duserdi.
 * - localhost/127.0.0.1 apex sayilir
 * - .vercel.app deployment preview'lari (xxx-suleyman.vercel.app)
 *   apex sayilir (slug parse edilmez)
 *
 * @param hostname Request.headers.get("host") veya window.location.hostname
 * @returns HostnameMatch — type'a gore handle edilir
 */
export function parseHostname(hostname: string): HostnameMatch {
  // 1) Port temizle, kucuk harfe cevir, "www." on ekini soy.
  //    www soyma BURADA (giriste) yapilir, cagiran tarafta DEGIL:
  //    parseHostname'in uc cagirani var (middleware, /api/contact,
  //    useTenant); normalizasyon cagirana birakilirsa dorduncu caginda
  //    yine unutulur. HostnameMatch.host zaten "DB'ye sorulacak deger"
  //    sozlesmesini tasiyor — normalize etme yeri o degeri ureten fonksiyon.
  const host = stripWww(hostname.split(":")[0].toLowerCase().trim());

  // 2) localhost / 127.0.0.1 → apex
  if (host === "localhost" || host === "127.0.0.1" || host === "") {
    return { type: "apex" };
  }

  const rootDomain = getRootDomain();

  // 3) Apex'in kendisi → apex
  if (host === rootDomain) {
    return { type: "apex" };
  }

  // 4) {slug}.{apex} → subdomain
  //    Apex'in tam endsWith kontrolu, sub kismi bos olmamali.
  //
  //    ESKI ADIM SILINDI: `host === "www." + rootDomain` kontrolu artik
  //    ULASILAMAZ — www.{apex} giriste soyulup 3. adimda apex olarak
  //    yakalaniyor.
  //
  //    `sub !== "www"` guard'i ise KALDI (olu degil): stripWww tek seviye
  //    soydugu icin www.www.{apex} gibi patolojik host'ta sub yine "www"
  //    olabilir. O durumda rezerve "www" slug'i donmesin diye custom_domain
  //    dalina dusuruyoruz — eski davranisla birebir ayni sonuc.
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

  // 5) Vercel preview deployment'lari (.vercel.app endsWith ama
  //    root_domain'den farkli olabilir, ornek: pr-1-suleyman.vercel.app)
  //    Bunlari apex say (gercek subdomain degil)
  if (host.endsWith(".vercel.app")) {
    return { type: "apex" };
  }

  // 6) Ne apex ne subdomain → custom_domain adayi
  //    (Asama A'da default'a duser; Asama B'de DB lookup yapilacak)
  return { type: "custom_domain", host };
}

/**
 * Istemci tarafi tenant sorgusu PLANI — hangi kolonla arayacagiz?
 *
 * TEK SORGU uretir; fallback ZINCIRI YOKTUR. Bu kasitli:
 *
 *   ESKI (bug) — useTenant once slug ile ariyordu:
 *     custom_domain host'unda slug "default"a dusuruluyordu; "default"
 *     tenant satiri HER ZAMAN var (014_protect_default_tenant), dolayisiyla
 *     ilk sorgu daima dolu donuyor, arkasindaki custom_domain sorgusu
 *     (`if (!data)` ile korunmus) HIC CALISMIYORDU. Sonuc: custom domain
 *     uzerinden admin panelinde YANLIS TENANT.
 *
 *   YENI: host neyse onunla aranir. Bulunamazsa null doner — SESSIZCE
 *   BASKA BIR TENANT'A DUSULMEZ. Yanlis tenant gostermektense hicbir sey
 *   gostermemek dogrudur (cross-tenant sizinti > bos ekran).
 */
export type TenantQuery =
  | { by: "custom_domain"; value: string }
  | { by: "slug"; value: string };

export function planTenantQuery(hostname: string): TenantQuery {
  const match = parseHostname(hostname);
  switch (match.type) {
    case "custom_domain":
      return { by: "custom_domain", value: match.host };
    case "subdomain":
      return { by: "slug", value: match.slug };
    case "apex":
      return { by: "slug", value: "default" };
  }
}

/**
 * Istemci sorgusu ATILMALI MI?
 *
 * Sunucu (middleware -> x-tenant-slug -> getCurrentTenant) tenant'i zaten
 * cozduyse TenantProvider'a initialTenant olarak iner; istemcinin ayni isi
 * ikinci bir yoldan tekrar cozmesi gereksiz VE tehlikelidir — iki yolun
 * ayrisabilmesi bu bug'in ta kendisiydi (sunucu Kurmay, istemci default).
 */
export function needsClientResolve(initialTenant: unknown): boolean {
  return !initialTenant;
}
