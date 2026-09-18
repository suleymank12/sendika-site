import Link from "next/link";

/**
 * "Alan Adı Tanımlı Değil" ekrani — FAIL-CLOSED gorunumu.
 *
 * IKI yerden kullanilir, ikisi de AYNI ekrani gostersin diye bilesenlestirildi:
 *   1. `app/admin/layout.tsx` — tenant cozulemediginde `children` YERINE
 *      render edilir (yonlendirme YOK, bkz. asagidaki not)
 *   2. `app/admin/tenant-bulunamadi/page.tsx` — middleware'in custom_domain
 *      fail-closed yonlendirmesinin hedefi
 *
 * 🔴 YONLENDIRME DEGIL RENDER: layout `redirect("/admin/tenant-bulunamadi")`
 * cagirsaydi, o adres de ayni layout'un altinda oldugu icin layout tekrar
 * calisir ve SONSUZ YONLENDIRME olurdu. Render etmek bu riski yapisal olarak
 * ortadan kaldirir — ayni desen `AdminTenantPasifView` icin de kullaniliyor.
 *
 * Server Component: tenant cozulemedigi icin BILEREK hicbir tenant verisi
 * (isim, logo, renk) okumaz. Yanlis kurumun kimligini gostermek bu ekranin
 * var olma sebebiyle celisirdi.
 */
export default function AdminTenantBulunamadiView() {
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
