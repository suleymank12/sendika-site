import { createClient } from "@/lib/supabase/server";
import PageLoader from "@/components/public/PageLoader";
import TopBar from "@/components/public/TopBar";
import Navbar from "@/components/public/Navbar";
import Footer from "@/components/public/Footer";
import ToastProvider from "@/components/ui/Toast";

function hexToRgbString(hex: string): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `${r} ${g} ${b}`;
}

function darkenColorRgb(hex: string, amount: number = 0.2): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, Math.round(((num >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((num >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((num & 255) * (1 - amount)));
  return `${r} ${g} ${b}`;
}

function lightenColorRgb(hex: string, amount: number = 0.2): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, Math.round(((num >> 16) & 255) + (255 - ((num >> 16) & 255)) * amount));
  const g = Math.min(255, Math.round(((num >> 8) & 255) + (255 - ((num >> 8) & 255)) * amount));
  const b = Math.min(255, Math.round((num & 255) + (255 - (num & 255)) * amount));
  return `${r} ${g} ${b}`;
}

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

  const navbarColor = settings.navbar_color || "#1B3A5C";

  return (
    <div
      style={{
        "--color-primary": hexToRgbString(navbarColor),
        "--color-primary-dark": darkenColorRgb(navbarColor, 0.2),
        "--color-primary-light": lightenColorRgb(navbarColor, 0.2),
      } as React.CSSProperties}
    >
      <TopBar
        siteTitle={settings.site_title || "Sendika Adı"}
        phone={settings.contact_phone || ""}
        email={settings.contact_email || ""}
      />
      <div className="relative">
        <Navbar
          menuItems={menuItems}
          logoUrl={settings.logo_url || "/placeholder-logo.png"}
          siteTitle={settings.site_title || "Sendika Adı"}
          layoutType={settings.layout_type || "layout1"}
        />
        <main className="min-h-[60vh]">{children}</main>
      </div>
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
    </div>
  );
}
