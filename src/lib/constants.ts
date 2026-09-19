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

/**
 * Kurulumda tohumlanan logo degeri (create-tenant) — "gercek logo YOK"
 * sentinel'i. Navbar bu degeri gorurse harf avatarina duser
 * (components/public/Navbar.tsx), iki kurulum listesi de "varsayilan logo
 * duruyor" der.
 *
 * TEK KAYNAK (19 Eylul 2026): deger iki kurulum listesinde de kullaniliyor —
 * super admin (lib/super-admin/setup-checklist.ts) ve kurum admini
 * (lib/setup-guide.ts). Ayrisirsa iki panel birbirini yalanlar: super admin
 * "varsayilan logo duruyor" derken kurum paneli "tamam" gosterir.
 *
 * Ikisi de BURADAN import eder. setup-checklist.ts bilerek import'suzdu;
 * bu onun tek istisnasi. Goreli yollar ".ts" uzantili, cunku Node test
 * script'leri bu dosyalari type stripping ile dogrudan calistiriyor
 * (test-idle-timeout.mjs bu dosyayi zaten oyle aliyor).
 */
export const PLACEHOLDER_LOGO_URL = "/placeholder-logo.png";

// Varsayilan meta tag degerleri
export const DEFAULT_META = {
  TITLE: "Sendika Adı",
  DESCRIPTION: "Sendika Adı Kurumsal Web Sitesi",
  OG_IMAGE: PLACEHOLDER_LOGO_URL,
} as const;

/**
 * Super admin panelinin KENDI alt alani (19 Eylul 2026).
 *
 * Panel `{SUPER_ADMIN_SUBDOMAIN}.{NEXT_PUBLIC_ROOT_DOMAIN}` host'unda
 * calisir; baska hicbir host'ta acilmaz, bu host'ta da panelden baska
 * hicbir sey acilmaz (middleware.ts iki kural).
 *
 * NEDEN AYRI HOST: panel butun musterilerin verisine erisiyor ve Supabase
 * oturum cerezi `httpOnly: false` (bkz. @supabase/ssr DEFAULT_COOKIE_OPTIONS)
 * — yani AYNI ORIGIN'deki bir XSS token'i dogrudan okuyabilir. Panel
 * eskiden `buyukdirilis.org.tr/super-admin` idi, yani default kurumun
 * public sitesiyle ayni origin; dahasi host kontrolu olmadigi icin HER
 * musteri domaininden de aciliyordu.
 *
 * 🔴 NEDEN ENV DEGISKENI DEGIL: `NEXT_PUBLIC_*` BUILD ANINDA gomuluyor
 * (NOTE.md -> VPS DEPLOY -> Tuzak 2; bu tuzaga bir kez dusulmus). Host'u
 * ayri bir env'e koymak, build makinesindeki deger yanlissa paneli
 * SESSIZCE kapatirdi. Kok domain zaten `getRootDomain()` ile tek kaynaktan
 * okunuyor; host ondan TURETILIYOR (lib/tenant-hostname.ts).
 *
 * Deger degisecekse: burasi + RESERVED_TENANT_SLUGS (asagida, bu sabitten
 * besleniyor) + Nginx/DNS tarafinda yeni ad. Yerelde karsiligi
 * `superadminpanel.lvh.me:3000` (lvh.me joker olarak 127.0.0.1'e cozulur).
 */
export const SUPER_ADMIN_SUBDOMAIN = "superadminpanel";

/** Super admin giris sayfasi — tenant'a BAGLI DEGIL (notr marka). */
export const SUPER_ADMIN_LOGIN_PATH = "/super-admin/giris";

/**
 * Super admin panelinin ana sayfasi. Panel host'unun KOK adresi (`/`)
 * buraya yonlendirilir (20 Eylul 2026) — bkz. middleware.ts kural (a).
 */
export const SUPER_ADMIN_HOME_PATH = "/super-admin";

/**
 * Tenant slug'i olarak kullanilamaz. Sebepler:
 * - "default": sistem fallback tenant'i (014 trigger + endpoint korumasi)
 * - "www", "admin", "api": yaygin subdomain rezervasyonlari (carpisma)
 * - "app", "auth", "static", "cdn": teknik subdomain'ler
 * - SUPER_ADMIN_SUBDOMAIN: o alt alan super admin paneline ait; bir kurum
 *   o slug'i alirsa host CAKISIR. Sabitten besleniyor ki ad degisirse
 *   rezervasyon geride kalmasin.
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
  SUPER_ADMIN_SUBDOMAIN,
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
