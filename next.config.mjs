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

/** @type {import('next').NextConfig} */
const nextConfig = {
  // VPS deploy'u icin kendi kendine yeten cikti (.next/standalone):
  // 369 MB node_modules yerine ~O(50 MB) server.js + trace edilmis moduller.
  // DIKKAT: standalone'a .next/static ve public/ OTOMATIK KOPYALANMAZ —
  // deploy adimlari NOTE.md "VPS deploy adimlari" bolumunde.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
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
