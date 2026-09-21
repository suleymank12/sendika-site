import { apiNotFound } from "@/lib/super-admin/api-host-guard";

/**
 * `/api/` ALTINDA OLMAYAN HER YOL → JSON 404 (K6, 21 Eylul 2026).
 *
 * NEDEN: `/api/` middleware matcher'inin BILEREK disinda (route handler'lar
 * kurumu host'tan kendileri cozer). Olmayan bir `/api/…` yolunda Next kendi
 * HTML 404 sayfasini MIDDLEWARE'SIZ render ediyordu → kurum basligi yok →
 * default kurumun kimligi. Olculdu: `kurmayteknoloji.com/api/yok` →
 * "Sendika Adı" (Buyuk Dirilis), og:site_name dahil. Bu dosya varken
 * `/api/…` altinda HICBIR HTML sayfasi render edilmez.
 *
 * GERCEK ROUTE'LAR ONCE ESLESIR: Next statik segmenti catch-all'dan once
 * secer; `/api/contact`'a GET hala contact'in 405'i (bu dosyanin 404'u DEGIL).
 * Olculdu ve muhurlu: izolasyon matrisi (7), her route dosyasi icin.
 *
 * Cevap `apiNotFound()` — super admin uclarinin musteri domainindeki 404'uyle
 * BAYT BAYT AYNI (gerekce orada). `/api` (tam yol) bu dosyaya DUSMEZ: en az
 * bir segment ister; o yol middleware'den gecen siradan bir 404.
 *
 * `force-dynamic`: dinamik segmentli GET varsayilanda istek basina
 * onbellege yazilabiliyor — rastgele her `/api/<x>` diske bir kayit
 * birakmasin.
 */
export const dynamic = "force-dynamic";

export const GET = apiNotFound;
export const HEAD = apiNotFound;
export const POST = apiNotFound;
export const PUT = apiNotFound;
export const PATCH = apiNotFound;
export const DELETE = apiNotFound;
export const OPTIONS = apiNotFound;
