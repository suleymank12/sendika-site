import { redirect } from "next/navigation";
import { getCurrentTenantOrNull } from "@/lib/get-tenant";
import AdminTenantBulunamadiView from "../_components/AdminTenantBulunamadiView";

/**
 * Middleware'in FAIL-CLOSED hedefi (`TENANT_ERROR_PATH`).
 *
 * /admin'e custom domain uzerinden gelindi ama o host hicbir tenant'a
 * cozulemedi (DB'de kayit yok). Admin tarafinda default'a dusmek YANLIS
 * TENANT'IN panelini acmak olurdu; bu sayfa gosterilir.
 *
 * B2 (23 Eylul 2026): bilinmeyen ozel alan adinin bu istegi de middleware'den
 * isaret slug'iyla (BILINMEYEN_ALAN_SLUG) gecer → admin layout kurumu
 * bulamaz ve `AdminTenantBulunamadiView`'u KENDISI render eder (kurum kimligi
 * yok). Eskiden istek "default" slug'iyla geliyordu: sekme basligi ve
 * og:site_name default kurumundu ("Alan adı tanımlı değil | Sendika Adı").
 *
 * KAYITLI kurumun host'unda (apex, gecerli subdomain, kayitli ozel alan adi)
 * bu adres acilirsa "alan adi tanimli degil" demek YANLIS — alan adi calisiyor
 * (olculdu: dort kayitli host'ta da bu mesaj + kurumun adi). En basit dogru
 * davranis: giris sayfasina yonlendir. Giris sayfasi kurum baglamini zaten
 * kuruyor; oturum aciksa middleware oradan panele alir. Karar SAYFADA, cunku
 * gecerli/gecersiz SUBDOMAIN ayrimini middleware bilmiyor (K8: render cozer).
 * Kurulum yoklamasi bu sayfanin icerigini OKUMAZ; yalniz middleware'in
 * `Location: /admin/tenant-bulunamadi` yonlendirmesine bakar (etkilenmez).
 */
export const metadata = {
  title: "Alan adı tanımlı değil",
};

export default async function TenantBulunamadiPage() {
  if (await getCurrentTenantOrNull()) redirect("/admin/giris");
  return <AdminTenantBulunamadiView />;
}
