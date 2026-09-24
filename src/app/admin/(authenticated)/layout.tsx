import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveCurrentTenant } from "@/lib/get-tenant";
import { decideAdminAccess, decideOturum } from "@/lib/admin-access";
import { isTransportAuthError } from "@/lib/supabase/cookie-sanitize";
import AdminShell from "@/components/admin/AdminShell";
import AdminTenantPasifView from "../_components/AdminTenantPasifView";
import AdminTenantBulunamadiView from "../_components/AdminTenantBulunamadiView";
import AdminGeciciHataView from "../_components/AdminGeciciHataView";

export default async function AuthenticatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();

  // 1) Auth
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  // C8 (24 Eylul 2026): TASIMA hatasi (Supabase'e ulasilamadi) GIRIS DEGIL —
  // "Geçici Bir Sorun" ekrani. Eskiden girise yonleniyordu; kismi kesintide
  // middleware'in getUser'i basariliysa giris sayfasi kullaniciyi geri
  // /admin'e yolluyor → dongu. Fail-closed: panel render edilmez.
  const oturum = decideOturum({ user, authError }, isTransportAuthError);
  if (oturum === "gecici-hata") {
    console.error("[AdminLayout] Auth dogrulanamadi (tasima, gecici):", authError);
    return <AdminGeciciHataView />;
  }
  if (oturum === "giris" || !user) {
    if (authError) console.error("[AdminLayout] Auth check failed:", authError);
    redirect("/admin/giris");
  }

  // 2) Tenant
  // FAIL-CLOSED — IKINCI KATMAN (b3).
  //
  // Asil kapi artik UST layout'ta (`app/admin/layout.tsx`): tenant
  // cozulemezse bu layout hic calismaz. Burasi savunma derinligi olarak
  // duruyor ve `getCurrentTenantOrNull()` null donebildigi icin tip
  // olarak da gerekli.
  //
  // Yonlendirme DEGIL render: ust layout ile ayni desen, sonsuz yonlendirme
  // riski yok (gerekce: `app/admin/layout.tsx` basindaki dongu analizi).
  const cozum = await resolveCurrentTenant();
  if (cozum.kind === "gecici-hata") {
    // C2: kurum okunamadi ≠ kurum yok (ust layout da ayni ekrani gosterir).
    return <AdminGeciciHataView />;
  }
  const tenant = cozum.kind === "found" ? cozum.tenant : null;
  if (!tenant) {
    console.error("[AdminLayout] Tenant resolve edilemedi — x-tenant-slug karsiligi yok");
    return <AdminTenantBulunamadiView />;
  }

  // 2.5) Pasif tenant: her durumda kapali (super admin de gormez,
  // reaktivasyon super-admin panelinden yapilir)
  if (!tenant.is_active) {
    return <AdminTenantPasifView />;
  }

  // 3) Tenant üyelik kontrolü — SÜPER ADMİN MUAFİYETİ YOK (19 Eylül 2026)
  //
  // Burada eskiden bir "süper admin bypass" vardı: `is_super_admin` RPC'si
  // true dönerse üyelik kontrolü atlanıp panel açılıyordu. Kaldırıldı.
  // Artık tek ölçüt var: BU KULLANICI BU KURUMUN ÜYESİ Mİ?
  //
  // NEDEN KALDIRILDI: süper admin hiçbir kurumun üyesi olmadığı hâlde her
  // müşterinin panelinde iş yapabiliyordu — haber silmek, site ayarlarını
  // değiştirmek, gelen mesajları (ad/e-posta/telefon/mesaj) okuyup silmek
  // dahil. Projede denetim kaydı yok, yani HİÇBİR İZ kalmıyordu. Bu
  // siteler sendika siteleri; KVKK md. 6 "sendika üyeliği"ni özel nitelikli
  // kişisel veri sayıyor ve iletişim formu mesajları bu ilişkiyi ele
  // verebiliyor.
  //
  // 🔴 BU KONTROL TEK BAŞINA YETMEZ — ve yetmesi de beklenmiyor. Tarayıcı
  // Supabase PostgREST'e DOĞRUDAN konuşuyor (createBrowserClient + oturum
  // JWT'si); burası yalnızca sunucuda çizilen bir ekran. Asıl sınır RLS:
  // `user_has_tenant_access` fonksiyonundaki süper admin kısayolu
  // **migration 029** ile kaldırıldı. Bu iki değişiklik BİRLİKTE anlamlı;
  // biri uygulanıp diğeri unutulursa açık kapanmaz.
  //
  // GİRMESİ GEREKİRSE: süper admin panelinden kendini o kurumun "Tenant
  // Admin Kullanıcıları" listesine ekler, işi bitince çıkarır — erişim
  // böylece bir `tenant_users` satırı olarak iz bırakır.
  // Gerekçe ve tam karar: NOTE.md → "SÜPER ADMİN KURUM ERİŞİMİ".
  const { data: membership, error: memberError } = await supabase
    .from("tenant_users")
    .select("id, role")
    .eq("user_id", user.id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();

  // KARAR SAF FONKSIYONDA (20 Eylul 2026) — `lib/admin-access`.
  //
  // Burada eskiden iki AYRI durum ayni ekrana cikiyordu:
  //   if (memberError) redirect("/admin/yetkisiz");   // gecici DB hatasi
  //   if (!membership) redirect("/admin/yetkisiz");   // gercek yetkisizlik
  // Supabase bir anligina hata dondugunde kullaniciya "bu kurumda yetkiniz
  // yok" deniyordu — yanlis cumle, ustelik "tekrar dene" yolu da yoktu.
  //
  // 🔴 FAIL-CLOSED KORUNDU: hata dalinda da panele SOKULMUYOR; yalniz
  // ekranin yazisi ve cikis yolu degisti. Uc dal testte kilitli
  // (scripts/test-admin-access.mjs).
  const decision = decideAdminAccess({
    user,
    tenant,
    membership,
    membershipError: memberError,
  });

  if (decision.kind === "gecici-hata") {
    console.error("[AdminLayout] Membership check failed:", memberError);
    return <AdminGeciciHataView />;
  }
  if (decision.kind === "yetkisiz") {
    redirect("/admin/yetkisiz");
  }

  // initialTenant: istemci tenant'i hostname'den TEKRAR cozmesin. Custom
  // domain'de istemci custom_domain'i cozemedigi icin default'a dusuyor,
  // panel BASKA TENANT'IN verisini gosteriyordu (8 Eylul 2026 bug'i).
  return <AdminShell initialTenant={tenant}>{children}</AdminShell>;
}
