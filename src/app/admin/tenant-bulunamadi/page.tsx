import AdminTenantBulunamadiView from "../_components/AdminTenantBulunamadiView";

/**
 * Middleware'in FAIL-CLOSED hedefi (`TENANT_ERROR_PATH`).
 *
 * /admin veya /super-admin'e custom domain uzerinden gelindi ama o host
 * hicbir tenant'a cozulemedi (DB'de kayit yok ya da lookup hata verdi).
 * Public tarafta bu durumda default tenant gosterilir (graceful degradation
 * — sadece okuma); admin tarafinda ise YANLIS TENANT'IN paneli acilmis olur.
 * Bu yuzden admin yolunda default'a dusmek yerine bu sayfa gosterilir.
 *
 * Ekranin kendisi `_components/AdminTenantBulunamadiView` icinde: ayni
 * gorunumu `app/admin/layout.tsx` de (olmayan SUBDOMAIN durumunda, hic
 * yonlendirme yapmadan) render ediyor.
 */
export const metadata = {
  title: "Alan adı tanımlı değil",
};

export default function TenantBulunamadiPage() {
  return <AdminTenantBulunamadiView />;
}
