import type { Metadata } from "next";
import { getCurrentTenantOrNull, resolveCurrentTenant } from "@/lib/get-tenant";
import AdminTenantBulunamadiView from "./_components/AdminTenantBulunamadiView";

/**
 * K8 (22 Eylul 2026): root layout, kurumu olmayan her istege artik NOTR
 * metadata veriyor ("Sayfa Bulunamadı" — public 404'u baska bir 404'ten
 * ayirt edilemesin diye). /admin/* bu karardan ETKILENMEMELI: bilinmeyen
 * subdomain'deki "Alan Adı Tanımlı Değil" ekrani K8'den ONCEKI metadata'yi
 * aynen tasir (baslik, aciklama, noindex). Yalniz `unknown-slug`'da devreye
 * girer; bulunan kurumda ve `no-header`'da (admin'de production'da olmaz)
 * root'unki gecerli kalir. Muhur: izolasyon matrisi
 * `bilinmeyen-sub|/admin/giris|admin-ekrani-korundu`.
 */
export async function generateMetadata(): Promise<Metadata> {
  const cozum = await resolveCurrentTenant();
  if (cozum.kind !== "unknown-slug") return {};
  return {
    title: "Site Bulunamadı",
    description: "Bu adrese tanımlı bir site bulunmuyor.",
    robots: { index: false, follow: false },
  };
}

/**
 * TUM /admin/* ROTALARININ FAIL-CLOSED KAPISI.
 *
 * NEDEN VAR (canli test, 19 Eylul 2026): b3 Asama 0'da fail-closed yalnizca
 * `(authenticated)/layout.tsx`'e konmustu. Ama GIRIS SAYFASI o grubun
 * DISINDA — `olmayan-kurum.buyukdirilis.org.tr/admin` istegi
 * `/admin/giris?next=%2Fadmin`'e yonlendi ve **DEFAULT kurumun giris formu**
 * acildi ("Sendika Adi"). Sekme basligi "Site Bulunamadi" diyordu (root
 * layout metadata'si duzeltilmisti) ama SAYFA default'undu.
 *
 * `(authenticated)` disindaki bes rota korumasizdi:
 *   /admin/giris · /admin/davet-kabul · /admin/sifremi-unuttum
 *   /admin/yetkisiz · /admin/tenant-bulunamadi
 *
 * Bunlardan `giris` ve `sifremi-unuttum` `getCurrentTenant()` kullaniyor —
 * yani default'a dusup DEFAULT'UN adini/basligini gosteriyorlardi.
 *
 * ZARAR SINIRI (durust olmak gerekirse): veri sizintisi DEGIL. Kullanici
 * giris yapsa bile `(authenticated)` katmani tenant'i cozemeyip kapiyi
 * tutuyor. Asil sorun, herhangi bir joker subdomain'in markali bir giris
 * formu servis etmesi — yani KIMLIK AVI YUZEYI.
 *
 * ---------------------------------------------------------------------------
 * NEDEN BURADA, baska bir yerde degil:
 *
 *  (a) Her korumasiz sayfaya ayri ayri → bes dosyada tekrar eden kod ve
 *      alticinci sayfa eklendiginde SESSIZCE unutulur. Bu bug zaten tam
 *      olarak "bir yer atlandi" bug'i.
 *  (b) Middleware'de subdomain dogrulamasi → her subdomain istegine
 *      +117 ms ve Edge'de `unstable_cache` olmadigi icin GERI ALINAMAZ;
 *      b3'un tum kazancini yerdi (Asama 0 kararinin aynisi).
 *  (c) BURASI → tek yer, sifir ek sorgu (`getCurrentTenantOrNull` hem
 *      React.cache hem unstable_cache'li; alttaki layout ayni sonucu
 *      paylasiyor), ve yeni eklenen her /admin sayfasi OTOMATIK korunur.
 *
 * ---------------------------------------------------------------------------
 * 🔴 SONSUZ DONGU ANALIZI — `redirect` YOK, `render` VAR.
 *
 * `redirect("/admin/tenant-bulunamadi")` yazsaydik: o adres de bu layout'un
 * altinda → layout tekrar calisir → tenant yine null → tekrar redirect →
 * SONSUZ DONGU. Bunun yerine `children` YERINE hata ekranini render
 * ediyoruz: hic gezinme olmadigi icin dongu YAPISAL OLARAK imkansiz.
 *
 * Middleware'in custom_domain fail-closed yonlendirmesi bozulmadi: o
 * durumda `x-tenant-slug` "default" kalir, tenant COZULUR, bu kapi acilir ve
 * `/admin/tenant-bulunamadi` sayfasi normal sekilde gorunur.
 *
 * NOT — /super-admin BILEREK kapsam disinda: platform seviyesi, tenant'a
 * bagli degil (kendi layout'unda tenant cozumu yok). Orada "yanlis kurum"
 * riski yok; guard eklemek mesru super admin'i kilitleyebilirdi.
 */
export default async function AdminRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tenant = await getCurrentTenantOrNull();

  if (!tenant) {
    return <AdminTenantBulunamadiView />;
  }

  return <>{children}</>;
}
