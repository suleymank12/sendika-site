import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";
import ContactForm from "@/components/public/ContactForm";
import { MapPin, Phone, Mail, Clock } from "lucide-react";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "İletişim",
  description: "İletişim bilgileri ve iletişim formu",
};

export default async function ContactPage() {
  const supabase = createClient();
  const { data } = await supabase.from("site_settings").select("key, value");
  const settings: Record<string, string> = {};
  data?.forEach((item: { key: string; value: string | null }) => {
    settings[item.key] = item.value || "";
  });

  return (
    <>
      <Breadcrumb items={[{ label: "İletişim" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">İletişim</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Contact Info */}
          <div>
            <div className="rounded-xl border border-border bg-white p-6 space-y-5">
              <h2 className="text-lg font-semibold text-text-dark">İletişim Bilgileri</h2>

              {settings.contact_address && (
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                    <MapPin className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-text-dark">Adres</h3>
                    <p className="text-sm text-text-muted mt-0.5">{settings.contact_address}</p>
                  </div>
                </div>
              )}

              {settings.contact_phone && (
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                    <Phone className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-text-dark">Telefon</h3>
                    <a href={`tel:${settings.contact_phone}`} className="text-sm text-text-muted hover:text-primary mt-0.5 block">
                      {settings.contact_phone}
                    </a>
                  </div>
                </div>
              )}

              {settings.contact_email && (
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                    <Mail className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-sm font-medium text-text-dark">E-posta</h3>
                    <a href={`mailto:${settings.contact_email}`} className="text-sm text-text-muted hover:text-primary mt-0.5 block">
                      {settings.contact_email}
                    </a>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2.5 shrink-0">
                  <Clock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-text-dark">Çalışma Saatleri</h3>
                  <p className="text-sm text-text-muted mt-0.5">Pazartesi - Cuma: 08:30 - 17:30</p>
                </div>
              </div>
            </div>
          </div>

          {/* Contact Form */}
          <div>
            <div className="rounded-xl border border-border bg-white p-6">
              <h2 className="text-lg font-semibold text-text-dark mb-4">Bize Yazın</h2>
              <ContactForm />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
