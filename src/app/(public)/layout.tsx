import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import { getSiteSettings } from "@/lib/site-settings";
import SiteKapaliView from "./_components/SiteKapaliView";
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

async function getMenuItems(tenantId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from("menu_items")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("order", { ascending: true });
  return data || [];
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getCurrentTenant();

  // Pasif tenant: public site kapali (default'a dusurmek yerine "kapali" goster)
  if (!tenant.is_active) {
    return <SiteKapaliView />;
  }

  const [settings, menuItems] = await Promise.all([
    getSiteSettings(tenant.id),
    getMenuItems(tenant.id),
  ]);

  // Tenant'ın kendi logo/favicon'u varsa onları kullan (site_settings'ten önce)
  const logoUrl = tenant.logo_url || settings.logo_url || "/placeholder-logo.png";

  const navbarColor = settings.navbar_color || "#1B3A5C";

  // YAPISKAN FOOTER (23 Eylul 2026): dis sarmalayici en az ekran boyu bir
  // sutun; div.relative ve main kalan yuksekligi doldurur, footer ekranin
  // dibine oturur. Kisa sayfada sayfa kaydirilmaz, bosluk ekranin icinde
  // kalir. Eskiden main'de `min-h-[60vh]` + detay sablonlarinda ayrica
  // `min-h-screen` vardi: header + 60vh + footer ekrandan uzundu (1440×900'de
  // 61 px zorunlu kaydirma), detaylarda footer bir ekran asagi itiliyordu
  // (raporlar/2026-09-22-2340-public-dogruluk-teshis.md A2).
  // main de bir sutun: kendi zemin rengi olan sayfa koku (`bg-gray-50 flex-1`
  // gibi) kalan alani doldurur. 🔴 Sayfalar kokte `min-h-screen` KULLANMAZ —
  // footer'i bir ekran asagi iter; zemin icin `flex-1`.
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{
        "--color-primary": hexToRgbString(navbarColor),
        "--color-primary-dark": darkenColorRgb(navbarColor, 0.2),
        "--color-primary-light": lightenColorRgb(navbarColor, 0.2),
      } as React.CSSProperties}
    >
      <a
        href="#icerik"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-primary focus:shadow-lg"
      >
        İçeriğe atla
      </a>
      <div className="relative flex flex-1 flex-col">
        {/* display:contents — header kutu olusturmaz: Navbar'in sticky (layout1)
            ve absolute overlay (layout2) konumlandirmasi, main'i de iceren bu
            div.relative'e gore cozulmeye devam eder. Duz bir header sarmalayici
            sticky'yi kendi yuksekligine hapsedip bozardi. Flex sutunda da
            ayni: TopBar ve Navbar bu div'in dogrudan ogeleri olur, sticky'nin
            kapsayicisi yine header + main'i birlikte kapsayan bu div. */}
        <header className="contents">
          <TopBar
            siteTitle={settings.site_title || tenant.name || "Sendika Adı"}
            phone={settings.contact_phone || ""}
            email={settings.contact_email || ""}
          />
          <Navbar
            menuItems={menuItems}
            logoUrl={logoUrl}
            siteTitle={settings.site_title || tenant.name || "Sendika Adı"}
            layoutType={settings.layout_type || "layout1"}
          />
        </header>
        <main id="icerik" tabIndex={-1} className="flex flex-1 flex-col outline-none">
          {children}
        </main>
      </div>
      <Footer
        siteTitle={settings.site_title || tenant.name || "Sendika Adı"}
        siteDescription={settings.site_description || ""}
        footerText={settings.footer_text || ""}
        showCredit={settings.footer_credit_enabled !== "false"}
        phone={settings.contact_phone || ""}
        email={settings.contact_email || ""}
        address={settings.contact_address || ""}
        facebookUrl={settings.facebook_url || ""}
        twitterUrl={settings.twitter_url || ""}
        instagramUrl={settings.instagram_url || ""}
        youtubeUrl={settings.youtube_url || ""}
        linkedinUrl={settings.linkedin_url || ""}
        whatsappUrl={settings.whatsapp_url || ""}
        telegramUrl={settings.telegram_url || ""}
        tiktokUrl={settings.tiktok_url || ""}
        threadsUrl={settings.threads_url || ""}
        blueskyUrl={settings.bluesky_url || ""}
        spotifyUrl={settings.spotify_url || ""}
      />
      <ToastProvider />
      <PageLoader />
    </div>
  );
}
