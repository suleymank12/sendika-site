import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import SifremiUnuttumForm from "./SifremiUnuttumForm";

export default async function SifremiUnuttumPage() {
  const tenant = await getCurrentTenant();

  // site_title çek (RootLayout pattern'i)
  const supabase = createClient();
  const { data: settings } = await supabase
    .from("site_settings")
    .select("value")
    .eq("tenant_id", tenant.id)
    .eq("key", "site_title")
    .maybeSingle();

  const title = settings?.value || tenant.name || "Sendika Adı";

  return <SifremiUnuttumForm initialTitle={title} />;
}
