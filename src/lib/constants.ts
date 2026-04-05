// Sayfalama
export const PAGE_SIZE = {
  NEWS: 12,
  ANNOUNCEMENTS: 12,
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
