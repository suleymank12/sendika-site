"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cleanupReplacedFile } from "@/lib/storage";
import { useTenant } from "@/hooks/useTenant";
import { useDirtyTracker } from "@/hooks/useDirtyForm";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ImageUploader from "@/components/admin/ImageUploader";
import FormField from "@/components/admin/FormField";
import Loading from "@/components/ui/Loading";
import {
  Check,
  Globe,
  Contact,
  AtSign,
  Palette,
  PanelBottom,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Settings {
  logo_url: string;
  favicon_url: string;
  site_title: string;
  site_description: string;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  facebook_url: string;
  twitter_url: string;
  instagram_url: string;
  youtube_url: string;
  linkedin_url: string;
  whatsapp_url: string;
  telegram_url: string;
  tiktok_url: string;
  threads_url: string;
  bluesky_url: string;
  spotify_url: string;
  footer_text: string;
  footer_credit_enabled: string;
  navbar_color: string;
  layout_type: string;
}

const defaultSettings: Settings = {
  logo_url: "",
  favicon_url: "",
  site_title: "",
  site_description: "",
  contact_phone: "",
  contact_email: "",
  contact_address: "",
  facebook_url: "",
  twitter_url: "",
  instagram_url: "",
  youtube_url: "",
  linkedin_url: "",
  whatsapp_url: "",
  telegram_url: "",
  tiktok_url: "",
  threads_url: "",
  bluesky_url: "",
  spotify_url: "",
  footer_text: "",
  footer_credit_enabled: "true",
  navbar_color: "#1B3A5C",
  layout_type: "layout1",
};

const NAVBAR_COLORS = [
  { label: "Lacivert", value: "#1B3A5C" },
  { label: "Koyu Yeşil", value: "#0D6E3F" },
  { label: "Kırmızı", value: "#8B1A1A" },
  { label: "Mor", value: "#4A1D6E" },
  { label: "Turuncu", value: "#B45309" },
  { label: "Koyu Gri", value: "#374151" },
  { label: "Turkuaz", value: "#0E7490" },
  { label: "Bordo", value: "#7F1D1D" },
];

const LAYOUT_OPTIONS = [
  {
    value: "layout1",
    label: "Layout 1 — Klasik",
    description: "Manşet sol, duyuru/haberler sağ",
  },
  {
    value: "layout2",
    label: "Layout 2 — Modern",
    description: "Tam genişlik manşet, alt grid",
  },
];

interface SectionProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingsSection({ icon: Icon, title, description, children }: SectionProps) {
  return (
    <section className="rounded-xl bg-white border border-border overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr]">
        <div className="p-6 lg:border-r border-border bg-bg-light/40">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-primary/10 p-2 shrink-0">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-semibold text-text-dark">{title}</h2>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">{description}</p>
        </div>
        <div className="p-6 space-y-4">{children}</div>
      </div>
    </section>
  );
}

export default function AdminSettingsPage() {
  const { tenant } = useTenant();
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  // Fetch HATASINDA form varsayilanlarla ACILMAZ: admin farkinda olmadan
  // kaydederse kurulusun gercek ayarlarinin ustune yazar (veri kaybi,
  // Tur 3 teshisi). Hata durumunda yalnizca "tekrar dene" ekrani gosterilir.
  const [loadFailed, setLoadFailed] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [saving, setSaving] = useState(false);
  // Replace orphan temizligi icin DB'den okunan ilk logo/favicon snapshot'i
  const [initialLogoUrl, setInitialLogoUrl] = useState<string | null>(null);
  const [initialFaviconUrl, setInitialFaviconUrl] = useState<string | null>(null);

  // --- Kaydedilmemis degisiklik korumasi (P6) ---
  // Snapshot karsilastirmasi; settings objesi hep {...defaultSettings}
  // uzerinden kuruldugu icin key sirasi deterministik — stringify guvenli.
  // Ayrintili gerekce haberler/[id]'de.
  const [settingsSnapshot, setSettingsSnapshot] = useState(() =>
    JSON.stringify(defaultSettings)
  );
  const isDirty = JSON.stringify(settings) !== settingsSnapshot;
  useDirtyTracker(isDirty);

  useEffect(() => {
    if (!tenant) return;
    const fetchSettings = async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("site_settings")
        .select("key, value")
        .eq("tenant_id", tenant.id);
      if (error) {
        setLoadFailed(true);
        setLoading(false);
        return;
      }
      // Bos data (yeni tenant, hic satir yok) HATA DEGIL — varsayilanlar dogru.
      setLoadFailed(false);
      const obj = { ...defaultSettings };
      data?.forEach((item: { key: string; value: string | null }) => {
        if (item.key in obj) {
          (obj as Record<string, string>)[item.key] = item.value || "";
        }
      });
      setSettings(obj);
      // Dirty snapshot'i: forma yazilan obj ile birebir ayni
      setSettingsSnapshot(JSON.stringify(obj));
      setInitialLogoUrl(obj.logo_url || null);
      setInitialFaviconUrl(obj.favicon_url || null);
      setLoading(false);
    };
    fetchSettings();
  }, [tenant, retryKey]);

  const handleSave = async () => {
    if (!tenant) {
      toast.error("Tenant bilgisi yüklenemedi.");
      return;
    }
    setSaving(true);
    const supabase = createClient();

    const updates = Object.entries(settings).map(([key, value]) =>
      supabase
        .from("site_settings")
        .upsert(
          { tenant_id: tenant.id, key, value: value || null, updated_at: new Date().toISOString() },
          { onConflict: "tenant_id,key" }
        )
    );

    const results = await Promise.all(updates);
    const hasError = results.some((r) => r.error);

    if (hasError) {
      toast.error("Bazı ayarlar kaydedilemedi.");
    } else {
      // Replace orphan temizligi: degisen logo/favicon eski dosyalari (best-effort).
      // Sayfa acik kaldigi icin snapshot'lar sonraki kayit icin yenilenir.
      await cleanupReplacedFile(supabase, initialLogoUrl, settings.logo_url || null);
      await cleanupReplacedFile(
        supabase,
        initialFaviconUrl,
        settings.favicon_url || null
      );
      setInitialLogoUrl(settings.logo_url || null);
      setInitialFaviconUrl(settings.favicon_url || null);
      // Kayit basarili: mevcut degerler yeni taban — form artik temiz
      // (sayfada kaliniyor, redirect yok; sonraki cikis onay SORMAMALI).
      setSettingsSnapshot(JSON.stringify(settings));
      toast.success("Ayarlar kaydedildi.");
    }
    setSaving(false);
  };

  const update = (key: keyof Settings, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (loading) {
    return (
      <>
        <AdminHeader title="Site Ayarları" helpTopic="ayarlar" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  // Form hic render edilmez -> kaydetme yolu tamamen kapali.
  if (loadFailed) {
    return (
      <>
        <AdminHeader title="Site Ayarları" helpTopic="ayarlar" />
        <div className="p-4 lg:p-6">
          <div className="max-w-xl mx-auto mt-12 rounded-xl border border-error/30 bg-error/5 p-6 text-center">
            <p className="font-medium text-text-dark">Ayarlar yüklenemedi.</p>
            <p className="text-sm text-text-muted mt-2">
              Mevcut ayarlarınızın yanlışlıkla üzerine yazılmaması için form
              açılmadı. İnternet bağlantınızı kontrol edip tekrar deneyin;
              sorun sürerse sayfayı yenileyin.
            </p>
            <Button
              className="mt-4"
              onClick={() => {
                setLoading(true);
                setLoadFailed(false);
                setRetryKey((k) => k + 1);
              }}
            >
              Tekrar Dene
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    // flex min-h-full flex-col + icerikte flex-1: icerik viewport'tan kisa
    // kaldiginda sticky bar ortada asili kalmasin, en alta otursun.
    <div className="flex min-h-full flex-col">
      <AdminHeader title="Site Ayarları" helpTopic="ayarlar" />
      <div className="flex-1 p-4 lg:p-6 pb-24">
        <div className="space-y-6">
          {/* Genel */}
          <SettingsSection
            icon={Globe}
            title="Genel Ayarlar"
            description="Sitenizin temel bilgileri. Başlık ve açıklama arama motorlarında da görünür."
          >
            <Input
              id="site-title"
              label="Site Başlığı"
              value={settings.site_title}
              onChange={(e) => update("site_title", e.target.value)}
              placeholder="Sendika Adı"
              helperText="Tarayıcı sekmesinde ve navbar'da görünür."
            />
            <FormField label="Site Açıklaması">
              <textarea
                value={settings.site_description}
                onChange={(e) => update("site_description", e.target.value)}
                rows={2}
                placeholder="Kısa site açıklaması"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
              <p className="text-xs text-text-muted mt-1">
                Google ve sosyal medya paylaşımlarında görünür. 1-2 cümle yeterli.
              </p>
            </FormField>
            <FormField label="Logo">
              <ImageUploader
                value={settings.logo_url}
                onChange={(url) => update("logo_url", url)}
                folder="branding"
              />
              <p className="text-xs text-text-muted mt-1">
                Önerilen: PNG formatı, şeffaf arka plan, en az 200 piksel yükseklik.
              </p>
            </FormField>
            <FormField label="Favicon (Tarayıcı Sekmesi İkonu)">
              <ImageUploader
                value={settings.favicon_url}
                onChange={(url) => update("favicon_url", url)}
                folder="branding"
                maxWidth={256}
                maxHeight={256}
                toWebp={false}
              />
              <p className="text-xs text-text-muted mt-1">
                Tarayıcı sekmesinde ve yer imlerinde görünür. Önerilen: kare PNG, 256x256 piksel.
                Yüklenmediğinde varsayılan ikon gösterilir.
              </p>
            </FormField>
          </SettingsSection>

          {/* İletişim */}
          <SettingsSection
            icon={Contact}
            title="İletişim Bilgileri"
            description="Ziyaretçilerin iletişim sayfasında ve footer'da göreceği bilgiler."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                id="contact-phone"
                label="Telefon"
                value={settings.contact_phone}
                onChange={(e) => update("contact_phone", e.target.value)}
                placeholder="+90 (312) 000 00 00"
              />
              <Input
                id="contact-email"
                label="E-posta"
                type="email"
                value={settings.contact_email}
                onChange={(e) => update("contact_email", e.target.value)}
                placeholder="info@sendika.org.tr"
              />
            </div>
            <FormField label="Adres">
              <textarea
                value={settings.contact_address}
                onChange={(e) => update("contact_address", e.target.value)}
                rows={2}
                placeholder="Açık adres"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </FormField>
          </SettingsSection>

          {/* Sosyal Medya */}
          <SettingsSection
            icon={AtSign}
            title="Sosyal Medya"
            description="Sosyal medya hesaplarınızın adresleri. Doldurmadığınız hesaplar sitede görünmez — yalnızca kullandıklarınızı eklemeniz yeterli."
          >
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 mb-2">
              <strong>Not:</strong> Boş bıraktığınız sosyal medya alanları anasayfa ve footer&apos;da gösterilmez.
              Yalnızca kullandığınız hesapların URL&apos;sini girin.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(
                [
                  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/sendika" },
                  { key: "twitter_url", label: "Twitter (X)", placeholder: "https://twitter.com/sendika" },
                  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/sendika" },
                  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/@sendika" },
                  { key: "linkedin_url", label: "LinkedIn", placeholder: "https://linkedin.com/company/sendika" },
                  { key: "whatsapp_url", label: "WhatsApp Kanalı", placeholder: "https://whatsapp.com/channel/..." },
                  { key: "telegram_url", label: "Telegram", placeholder: "https://t.me/sendika" },
                  { key: "tiktok_url", label: "TikTok", placeholder: "https://tiktok.com/@sendika" },
                  { key: "threads_url", label: "Threads", placeholder: "https://threads.net/@sendika" },
                  { key: "bluesky_url", label: "Bluesky", placeholder: "https://bsky.app/profile/sendika.bsky.social" },
                  { key: "spotify_url", label: "Spotify", placeholder: "https://open.spotify.com/show/..." },
                ] as const
              ).map((field) => (
                <FormField key={field.key} label={field.label}>
                  <div className="relative">
                    <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
                    <input
                      id={field.key}
                      type="url"
                      value={settings[field.key]}
                      onChange={(e) => update(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                </FormField>
              ))}
            </div>
          </SettingsSection>

          {/* Tema */}
          <SettingsSection
            icon={Palette}
            title="Tema ve Görünüm"
            description="Sitenizin ana rengi ve anasayfa düzeni. Değişiklikler tüm sayfalara uygulanır."
          >
            {/* Navbar Renk Seçici */}
            <FormField label="Navbar Rengi">
              <div className="flex flex-wrap gap-3">
                {NAVBAR_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => update("navbar_color", color.value)}
                    className={cn(
                      "relative w-12 h-12 rounded-lg border-2 transition-all",
                      settings.navbar_color === color.value
                        ? "border-primary ring-2 ring-primary/30 scale-110"
                        : "border-border hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.label}
                  >
                    {settings.navbar_color === color.value && (
                      <Check className="absolute inset-0 m-auto h-5 w-5 text-white drop-shadow" />
                    )}
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Seçili: <span className="font-medium text-text-dark">
                  {NAVBAR_COLORS.find((c) => c.value === settings.navbar_color)?.label || settings.navbar_color}
                </span>
              </p>
            </FormField>

            {/* Layout Seçici */}
            <FormField label="Anasayfa Düzeni">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {LAYOUT_OPTIONS.map((layout) => (
                  <button
                    key={layout.value}
                    type="button"
                    onClick={() => update("layout_type", layout.value)}
                    className={cn(
                      "text-left rounded-lg border-2 p-4 transition-all",
                      settings.layout_type === layout.value
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    )}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm text-text-dark">{layout.label}</span>
                      {settings.layout_type === layout.value && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <p className="text-xs text-text-muted">{layout.description}</p>
                  </button>
                ))}
              </div>
            </FormField>
          </SettingsSection>

          {/* Footer */}
          <SettingsSection
            icon={PanelBottom}
            title="Footer"
            description="Sitenin en altında görünecek telif hakkı yazısı ve yapımcı bilgisi."
          >
            <Input
              id="footer-text"
              label="Footer Alt Yazısı"
              value={settings.footer_text}
              onChange={(e) => update("footer_text", e.target.value)}
              placeholder="© 2026 Sendika Adı. Tüm hakları saklıdır."
              helperText="Her sayfanın en altında görünür."
            />
            <FormField label="Yapımcı Bilgisi">
              <label className="flex items-start gap-3 rounded-lg border border-border p-3 cursor-pointer hover:bg-bg-light/40 transition-colors">
                <input
                  type="checkbox"
                  checked={settings.footer_credit_enabled !== "false"}
                  onChange={(e) =>
                    update("footer_credit_enabled", e.target.checked ? "true" : "false")
                  }
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
                />
                <div className="flex-1">
                  <span className="text-sm font-medium text-text-dark">
                    Footer&apos;da yapımcı yazısı görünsün
                  </span>
                  <p className="text-xs text-text-muted mt-0.5">
                    İşaretli olduğunda telif yazısının yanında küçük bir yapımcı kredisi görünür.
                  </p>
                </div>
              </label>
            </FormField>
          </SettingsSection>
        </div>
      </div>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-white px-4 lg:px-6 py-3 flex items-center gap-3 justify-end shadow-[0_-2px_8px_rgba(0,0,0,0.03)]">
        <p className="text-xs text-text-muted mr-auto hidden sm:block">
          Değişiklikler kaydedilene kadar uygulanmaz.
        </p>
        <Button onClick={handleSave} loading={saving}>
          Ayarları Kaydet
        </Button>
      </div>
    </div>
  );
}
