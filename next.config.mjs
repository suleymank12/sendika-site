/**
 * Statik guvenlik header'lari.
 *
 * NEDEN BURADA, NGINX'TE DEGIL: bunlar istek basina degismiyor ve
 * next.config'te durduklarinda hem Vercel'de hem VPS/Nginx arkasinda
 * otomatik calisirlar — tasinabilirlik icin dogru yer burasi.
 *
 * CSP BURADA YOK: nonce her istekte degistigi icin statik olarak yazilamaz,
 * middleware.ts'te uretiliyor.
 *
 * HSTS (Strict-Transport-Security) BILEREK YOK: TLS'i sonlandiran katman
 * Nginx; ayrica yanlis bir max-age geri alinamaz, o yuzden deploy tarafinda
 * bilincli olarak set edilmeli.
 */
const securityHeaders = [
  // MIME sniffing kapali (statik varliklar dahil her yanit icin)
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Cross-origin gezinmede tam URL sizmasin
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Kullanilmayan guclu API'ler kapali
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  // CSP frame-ancestors'in eski tarayici karsiligi (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
];

/**
 * Gorsel ucunun (`/_next/image`) izinli TEK kaynagi: bizim Supabase projemiz.
 *
 * 🔴 NEDEN (21 Eylul 2026, Faz 1): kural eskiden `*.supabase.co` idi —
 * HERHANGI BIRININ projesi. Uc gorseli SUNUCUDA indirip sharp'la isliyor;
 * saldirgan kendi projesine koydugu AVIF ile libheif'e (GHSA-2xp9-vwfh-vxw4,
 * kritik RCE) ya da devasa gorselle bellege (GHSA-9g9p-9gw9-jx7f) kimliksiz
 * ulasabiliyordu. Olcum: canli DB'deki 31 Supabase adresinin 31'i bu host'ta.
 *
 * Host env'den turetilir (beyaz etiket: adres koda gomulmez). Kural
 * `src/lib/storage-host.ts` ile AYNI olmali — bu dosya TS import edemedigi
 * icin ayristirma burada tekrarlandi; esitligi `test:gorsel-zinciri`
 * config'i gercekten yukleyerek dogruluyor.
 *
 * Env yoksa build HATAYLA durur: sessizce bos liste uretmek butun
 * gorselleri 400'e dusururdu. (Next `.env*` dosyalarini config'den ONCE
 * yukluyor — next/dist/server/config.js loadConfig.)
 */
function ownStorageHostname() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let host = "";
  try {
    host = new URL(String(raw || "").trim()).hostname;
  } catch {
    host = "";
  }
  if (!host) {
    throw new Error(
      "next.config.mjs: NEXT_PUBLIC_SUPABASE_URL tanimli degil ya da gecersiz — " +
        "gorsel ucunun izin listesi kurulamaz. Build ortaminin .env dosyasini kontrol edin."
    );
  }
  return host;
}

/**
 * Kurum basligi kanitinin sirri (21 Eylul 2026, K7-B). Middleware
 * `x-tenant-slug`'in yanina HMAC kaniti yaziyor (src/lib/tenant-proof.ts);
 * render slug'i yalniz kanit dogrulanirsa okuyor.
 *
 * Sir yoksa uygulama FAIL-CLOSED calisir: her istek notr 404'e duser —
 * sessizce acik kalmaz ama site de coker. Bu yuzden build BURADA durur:
 * sir .env'e eklenmeden canliya build cikmasin. (Next build'de yukledigi
 * `.env*` dosyalarini standalone'a kopyaliyor; sir yalniz build kabuguna
 * verilirse canliya ULASMAZ — dosyada olmali.)
 *
 * Alt sinir tenant-proof.ts `TENANT_SECRET_MIN_LENGTH` ile AYNI (bu dosya TS
 * import edemiyor; esitligi test:tenant-proof sinar). Hata mesaji sirri
 * YAZMAZ. `NEXT_PUBLIC_` onekiyle tanim ASLA: istemci paketine gomulur.
 */
const TENANT_SECRET_MIN_LENGTH = 32;

function requireTenantHeaderSecret() {
  if (process.env.NEXT_PUBLIC_TENANT_HEADER_SECRET !== undefined) {
    throw new Error(
      "next.config.mjs: NEXT_PUBLIC_TENANT_HEADER_SECRET tanimli — bu sir istemci paketine gomulurdu. " +
        "Satiri silin; yalniz TENANT_HEADER_SECRET kullanilir."
    );
  }
  const uzunluk = String(process.env.TENANT_HEADER_SECRET || "").length;
  if (uzunluk < TENANT_SECRET_MIN_LENGTH) {
    throw new Error(
      `next.config.mjs: TENANT_HEADER_SECRET ${uzunluk === 0 ? "tanimli degil" : `${TENANT_SECRET_MIN_LENGTH} karakterden kisa (${uzunluk})`} — ` +
        "kurum basligi kaniti uretilemez, site her istekte notr 404'e duserdi. " +
        "Build ortaminin .env dosyasina ekleyin (uretim degeri: `openssl rand -hex 32`)."
    );
  }
}
requireTenantHeaderSecret();

/** @type {import('next').NextConfig} */
const nextConfig = {
  // `X-Powered-By: Next.js` yanit basligi kapali (21 Eylul 2026, K7 teshisi
  // §2'de olculdu): cercevenin adini her yanitta ilan etmeye gerek yok.
  poweredByHeader: false,
  // VPS deploy'u icin kendi kendine yeten cikti (.next/standalone):
  // 369 MB node_modules yerine ~O(50 MB) server.js + trace edilmis moduller.
  // DIKKAT: standalone'a .next/static ve public/ OTOMATIK KOPYALANMAZ —
  // deploy adimlari NOTE.md "VPS deploy adimlari" bolumunde.
  output: "standalone",
  images: {
    // Yalniz q=75 (21 Eylul 2026, K5). Sitede baska kalite yok: next/image
    // varsayilani + og:image zinciri (OG_IMAGE_QUALITY) — test:gorsel-zinciri
    // muhurluyor. Eskiden q 1-100 serbestti: varyant uzayi 100 kat, kural
    // yalniz nginx'teydi. 14.2.35 bu ayari zorluyor (image-optimizer.js:
    // "q parameter (quality) of 50 is not allowed"); Next 16'nin varsayilani
    // da [75] → yukseltmede izolasyon matrisinde fark uretmez.
    qualities: [75],
    remotePatterns: [
      {
        protocol: "https",
        hostname: ownStorageHostname(),
        // Yalniz varsayilan port (443). Bos dize "port belirtilmemis" demek;
        // alan HIC yazilmasa her port kabul edilirdi.
        port: "",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      // 🔴 JETON REFERER'A SIZMASIN — yalniz kabul sayfasi (20 Eylul 2026, P3)
      //
      // Mail linkleri artik jetonu SORGUDA tasiyor
      // (`?token_hash=…&type=…`). Genel kural
      // `strict-origin-when-cross-origin`: DIS isteklere yalniz origin
      // gider (sorgu gitmez, olculdu), ama AYNI origin'e yapilan her
      // istekte TAM URL Referer olarak gider — sayfanin kendi
      // JS/CSS/font/XHR istekleri dahil. Nginx'in varsayilan `combined`
      // formati `$http_referer`'i loglar; yani jeton sunucu log'una duser.
      //
      // `no-referrer` bu sinifi tamamen kapatir: sayfa hicbir istekte
      // Referer gondermez. Bedeli yok — bu sayfada analitik, dis kaynak
      // ya da referer'a bakan bir akis YOK.
      //
      // Ikinci savunma sayfanin kendisinde: `history.replaceState` jetonu
      // dogrulamadan ONCE adres cubugundan siliyor. Header once yazilir
      // (ilk yuklemenin alt istekleri icin), replaceState sonrasini kapatir.
      //
      // NOT: bu blok `/:path*` blogundan SONRA gelmeli — Next eslesen
      // header'lari sirayla uygular ve ayni anahtarda SONUNCU kazanir
      // (olculdu: `npm run dev` + curl, yalniz `no-referrer` dondu).
      {
        source: "/admin/davet-kabul",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
