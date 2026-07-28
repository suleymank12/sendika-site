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
    ];
  },
};

export default nextConfig;
