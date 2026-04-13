"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ImageUploader from "@/components/admin/ImageUploader";
import FormField from "@/components/admin/FormField";
import Loading from "@/components/ui/Loading";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface Settings {
  logo_url: string;
  site_title: string;
  site_description: string;
  contact_phone: string;
  contact_email: string;
  contact_address: string;
  facebook_url: string;
  twitter_url: string;
  instagram_url: string;
  youtube_url: string;
  footer_text: string;
  navbar_color: string;
  layout_type: string;
}

const defaultSettings: Settings = {
  logo_url: "",
  site_title: "",
  site_description: "",
  contact_phone: "",
  contact_email: "",
  contact_address: "",
  facebook_url: "",
  twitter_url: "",
  instagram_url: "",
  youtube_url: "",
  footer_text: "",
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

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const supabase = createClient();
      const { data } = await supabase.from("site_settings").select("key, value");
      if (data) {
        const obj = { ...defaultSettings };
        data.forEach((item: { key: string; value: string | null }) => {
          if (item.key in obj) {
            (obj as Record<string, string>)[item.key] = item.value || "";
          }
        });
        setSettings(obj);
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    const supabase = createClient();

    const updates = Object.entries(settings).map(([key, value]) =>
      supabase
        .from("site_settings")
        .upsert({ key, value: value || null, updated_at: new Date().toISOString() }, { onConflict: "key" })
    );

    const results = await Promise.all(updates);
    const hasError = results.some((r) => r.error);

    if (hasError) {
      toast.error("Bazı ayarlar kaydedilemedi.");
    } else {
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
        <AdminHeader title="Site Ayarları" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title="Site Ayarları" />
      <div className="p-4 lg:p-6 max-w-3xl space-y-6">

        {/* Genel */}
        <div className="rounded-xl bg-white border border-border p-5 space-y-4">
          <h3 className="font-semibold text-text-dark border-b border-border pb-2">Genel Ayarlar</h3>
          <Input
            id="site-title"
            label="Site Başlığı"
            value={settings.site_title}
            onChange={(e) => update("site_title", e.target.value)}
            placeholder="Sendika Adı"
          />
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Site Açıklaması</label>
            <textarea
              value={settings.site_description}
              onChange={(e) => update("site_description", e.target.value)}
              rows={2}
              placeholder="Kısa site açıklaması (SEO için)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <FormField label="Logo">
            <ImageUploader
              value={settings.logo_url}
              onChange={(url) => update("logo_url", url)}
              folder="branding"
            />
          </FormField>
        </div>

        {/* İletişim */}
        <div className="rounded-xl bg-white border border-border p-5 space-y-4">
          <h3 className="font-semibold text-text-dark border-b border-border pb-2">İletişim Bilgileri</h3>
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
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Adres</label>
            <textarea
              value={settings.contact_address}
              onChange={(e) => update("contact_address", e.target.value)}
              rows={2}
              placeholder="Açık adres"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
        </div>

        {/* Sosyal Medya */}
        <div className="rounded-xl bg-white border border-border p-5 space-y-4">
          <h3 className="font-semibold text-text-dark border-b border-border pb-2">Sosyal Medya</h3>
          <Input
            id="facebook"
            label="Facebook URL"
            value={settings.facebook_url}
            onChange={(e) => update("facebook_url", e.target.value)}
            placeholder="https://facebook.com/sendika"
          />
          <Input
            id="twitter"
            label="Twitter (X) URL"
            value={settings.twitter_url}
            onChange={(e) => update("twitter_url", e.target.value)}
            placeholder="https://twitter.com/sendika"
          />
          <Input
            id="instagram"
            label="Instagram URL"
            value={settings.instagram_url}
            onChange={(e) => update("instagram_url", e.target.value)}
            placeholder="https://instagram.com/sendika"
          />
          <Input
            id="youtube"
            label="YouTube URL"
            value={settings.youtube_url}
            onChange={(e) => update("youtube_url", e.target.value)}
            placeholder="https://youtube.com/@sendika"
          />
        </div>

        {/* Tema Ayarları */}
        <div className="rounded-xl bg-white border border-border p-5 space-y-4">
          <h3 className="font-semibold text-text-dark border-b border-border pb-2">Tema Ayarları</h3>

          {/* Navbar Renk Seçici */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">Navbar Rengi</label>
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
            <p className="text-xs text-text-muted mt-1.5">
              Seçili: {NAVBAR_COLORS.find((c) => c.value === settings.navbar_color)?.label || settings.navbar_color}
            </p>
          </div>

          {/* Layout Seçici */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">Anasayfa Düzeni</label>
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
          </div>
        </div>

        {/* Footer */}
        <div className="rounded-xl bg-white border border-border p-5 space-y-4">
          <h3 className="font-semibold text-text-dark border-b border-border pb-2">Footer</h3>
          <Input
            id="footer-text"
            label="Footer Alt Yazısı"
            value={settings.footer_text}
            onChange={(e) => update("footer_text", e.target.value)}
            placeholder="© 2026 Sendika Adı. Tüm hakları saklıdır."
          />
        </div>

        {/* Save */}
        <div className="flex justify-end pb-6">
          <Button onClick={handleSave} loading={saving} size="lg">
            Ayarları Kaydet
          </Button>
        </div>
      </div>
    </>
  );
}
