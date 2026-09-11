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

/**
 * Dosya yukleme boyut sinirlari (MB). TEK KAYNAK: ImageUploader,
 * MediaUploader, MediaSection, RichTextEditor ve galeri coklu yukleme
 * bu degerleri kullanir — limit degisecekse yalniz burasi degisir.
 *
 * VIDEO 50 (12 Eylul 2026): Supabase FREE plani dosya basina 50 MB'i
 * REDDEDIYOR ve Pro'ya gecilmeyecek (musteri karari) — sinir KALICI.
 * Eskiden 400'du: 50-400 MB arasi video istemci kontrolunden geciyor,
 * dakikalarca yukleniyor, Supabase 413 ile reddedince kullanici yalnizca
 * "Video yuklenirken hata olustu." goruyordu. 50'de dosya secilir secilmez
 * sebebi ve caresi yaziliyor (MediaUploader). Pro'ya gecilirse UC yer
 * birlikte guncellenir: burasi, KURULUM Adim 4 bucket satiri, NOTE.md
 * "SUPABASE PLANI" kaydi.
 */
export const MAX_UPLOAD_MB = {
  IMAGE: 50,
  VIDEO: 50,
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

/**
 * Oturum zaman asimi — admin + super admin paneli (12 Eylul 2026).
 * TEK KAYNAK: hooks/useIdleTimeout.tsx. Degisirse NOTE.md "OTURUM ZAMAN
 * ASIMI" kaydini da guncelleyin; Supabase'de inaktivite ayari acildiysa o da
 * ayni degere cekilir. Elle test icin yerelde gecici kisaltilabilir —
 * scripts/test-idle-timeout.mjs 30'dan farkli degeri commit'ten once yakalar.
 */
export const OTURUM_ZAMAN_ASIMI = {
  /** Bu kadar dakika islem yapilmazsa oturum UYARISIZ kapatilir. */
  SURE_DK: 30,
} as const;

/**
 * Anasayfada en fazla kac manset olabilir. TEK KAYNAK — iki yol da bunu
 * kullanir: Mansetler sayfasindaki "Yeni Manşet Ekle" ve haber/duyuru
 * editorundeki "Manşete Ekle" kutusu. Eskiden sinir yalniz Mansetler
 * sayfasinda sabit 10'du, editor yolu SINIRSIZDI (12 Eylul 2026 bulgusu).
 * Sayim PASIF mansetleri de kapsar — iki yol ayni sayiyi soylesin.
 */
export const MANSET_LIMIT = 10;
