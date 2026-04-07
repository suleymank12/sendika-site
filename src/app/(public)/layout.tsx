import { createClient } from "@/lib/supabase/server";
import PageLoader from "@/components/public/PageLoader";
import TopBar from "@/components/public/TopBar";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";
import ToastProvider from "@/components/ui/Toast";

async function getSettings() {
  const supabase = createClient();
  const { data } = await supabase.from("site_settings").select("key, value");
  const settings: Record<string, string> = {};
  data?.forEach((item: { key: string; value: string | null }) => {
    settings[item.key] = item.value || "";
  });
  return settings;
}

async function getMenuItems() {
  const supabase = createClient();
  const { data } = await supabase
    .from("menu_items")
    .select("*")
    .eq("is_active", true)
    .order("order", { ascending: true });
  return data || [];
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [settings, menuItems] = await Promise.all([getSettings(), getMenuItems()]);

  return (
    <>
      <TopBar
        siteTitle={settings.site_title || "Sendika Adı"}
        phone={settings.contact_phone || ""}
        email={settings.contact_email || ""}
      />
      <Navbar
        menuItems={menuItems}
        logoUrl={settings.logo_url || "/placeholder-logo.png"}
        siteTitle={settings.site_title || "Sendika Adı"}
      />
      <main className="min-h-[60vh]">{children}</main>
      <Footer
        siteTitle={settings.site_title || "Sendika Adı"}
        siteDescription={settings.site_description || ""}
        footerText={settings.footer_text || ""}
        phone={settings.contact_phone || ""}
        email={settings.contact_email || ""}
        address={settings.contact_address || ""}
        facebookUrl={settings.facebook_url || ""}
        twitterUrl={settings.twitter_url || ""}
        instagramUrl={settings.instagram_url || ""}
        youtubeUrl={settings.youtube_url || ""}
      />
      <ToastProvider />
      <PageLoader />
    </>
  );
}
