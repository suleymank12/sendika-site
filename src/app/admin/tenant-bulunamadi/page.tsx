import Link from "next/link";

/**
 * Middleware'in FAIL-CLOSED hedefi.
 *
 * /admin veya /super-admin'e custom domain uzerinden gelindi ama o host
 * hicbir tenant'a cozulemedi (DB'de kayit yok ya da lookup hata verdi).
 * Public tarafta bu durumda default tenant gosterilir (graceful degradation
 * — sadece okuma); admin tarafinda ise YANLIS TENANT'IN paneli acilmis olur.
 * Bu yuzden admin yolunda default'a dusmek yerine bu sayfa gosterilir.
 *
 * Server Component: tenant cozulemedigi icin bilerek hicbir tenant verisi
 * (isim, logo, renk) okumaz.
 */
export const metadata = {
  title: "Alan adı tanımlı değil",
};

export default function TenantBulunamadiPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-bg-light px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl bg-white p-8 shadow-sm border border-border">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-text-dark tracking-tight">
              Alan Adı Tanımlı Değil
            </h1>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              Bu alan adı hiçbir kuruluşa bağlı değil, bu yüzden yönetim
              paneli açılamadı. Yanlış bir kuruluşun paneline girmenizi
              önlemek için işlem durduruldu.
            </p>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              Kuruluşunuzun kendi adresinden tekrar deneyin. Sorun sürerse
              site yöneticisiyle iletişime geçin.
            </p>
          </div>

          <Link
            href="/"
            className="block w-full rounded-lg border border-border bg-white text-center px-4 py-2.5 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
          >
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </div>
  );
}
