// Sayfalama
export const PAGE_SIZE = {
  NEWS: 12,
  ANNOUNCEMENTS: 15,
  GALLERY: 12,
  ADMIN_TABLE: 20,
} as const;

// Supabase Storage
export const STORAGE_BUCKETS = {
  IMAGES: "images",
  DOCUMENTS: "documents",
} as const;

// Varsayilan meta tag degerleri
export const DEFAULT_META = {
  TITLE: "Sendika Adı",
  DESCRIPTION: "Sendika Adı Kurumsal Web Sitesi",
  OG_IMAGE: "/placeholder-logo.png",
} as const;

/**
 * Tenant slug'i olarak kullanilamaz. Sebepler:
 * - "default": sistem fallback tenant'i (014 trigger + endpoint korumasi)
 * - "www", "admin", "api": yaygin subdomain rezervasyonlari (carpisma)
 * - "app", "auth", "static", "cdn": teknik subdomain'ler
 */
export const RESERVED_TENANT_SLUGS = [
  "default",
  "www",
  "admin",
  "api",
  "app",
  "auth",
  "static",
  "cdn",
] as const;

export type ReservedTenantSlug = (typeof RESERVED_TENANT_SLUGS)[number];

/**
 * Slug formati: lowercase, alfanumeric, tire (basta/sonda olamaz).
 */
export const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Slug uzunluk sinirlari.
 * - Min 2: tek karakter URL kalitesini bozar
 * - Max 50: DNS subdomain limiti 63, guvenli pay birakildi
 */
export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 50;

/**
 * Custom domain format regex: hostname formati.
 * - Lowercase + rakam + tire + nokta
 * - En az bir nokta (TLD zorunlu)
 * - Protokol/path/port reddedilir
 * - IDN/punycode kullaniciya birakilir (xn-- baslangicli kabul edilir)
 */
export const CUSTOM_DOMAIN_REGEX =
  /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/**
 * /kurumsal/* rotalarinin icerik kaynagi olan rezerve pages slug'lari.
 * Ayni satirlar /sayfa/{slug} altinda da render edilebildigi icin duplicate
 * content olusur. Cozum iki katmanli (b6 Asama 2):
 *  - sitemap.ts /sayfa/ varyantini LISTELEMEZ
 *  - sayfa/[slug] canonical'i /kurumsal/{slug}'i gosterir
 */
export const KURUMSAL_PAGE_SLUGS = [
  "hakkimizda",
  "tuzuk",
  "misyon-vizyon",
] as const;

// Site ayarlari anahtarlari
export const SETTING_KEYS = {
  LOGO_URL: "logo_url",
  SITE_TITLE: "site_title",
  SITE_DESCRIPTION: "site_description",
  FOOTER_TEXT: "footer_text",
  CONTACT_PHONE: "contact_phone",
  CONTACT_EMAIL: "contact_email",
  CONTACT_ADDRESS: "contact_address",
  FACEBOOK_URL: "facebook_url",
  TWITTER_URL: "twitter_url",
  INSTAGRAM_URL: "instagram_url",
} as const;
