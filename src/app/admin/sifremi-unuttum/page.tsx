import { createClient } from "@/lib/supabase/server";
import { getCurrentTenantOrNull } from "@/lib/get-tenant";
import { YEDEK_SITE_ADI } from "@/lib/constants";
import SifremiUnuttumForm from "./SifremiUnuttumForm";

export default async function SifremiUnuttumPage() {
  // 🔴 SAYFA SEVIYESI FAIL-CLOSED — gerekcesi `admin/giris/page.tsx`'te:
  // layout ile sayfa PARALEL kostugu icin layout'un kapisi bu fonksiyonun
  // calismasini ve sonucunu Flight yukune yazmasini ENGELLEMIYOR.
  const tenant = await getCurrentTenantOrNull();
  if (!tenant) return null; // layout hata ekranini gosteriyor

  // site_title çek (RootLayout pattern'i)
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", "site_title")
    .maybeSingle();

  const title = settings?.value || tenant.name || YEDEK_SITE_ADI;

  return <SifremiUnuttumForm initialTitle={title} />;
}
