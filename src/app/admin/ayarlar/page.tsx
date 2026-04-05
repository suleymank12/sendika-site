"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ImageUploader from "@/components/admin/ImageUploader";
import FormField from "@/components/admin/FormField";
import Loading from "@/components/ui/Loading";
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
};

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
