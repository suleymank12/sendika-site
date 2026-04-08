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

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          {/* Contact Info */}
          <div className="h-full">
            <div className="rounded-xl border border-border bg-white p-6 h-full min-h-[480px] flex flex-col">
              <h2 className="text-lg font-semibold text-text-dark mb-5">İletişim Bilgileri</h2>
              <div className="space-y-7">

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
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-text-dark mb-1.5">Çalışma Saatleri</h3>
                  <ul className="text-sm text-text-muted space-y-1">
                    <li className="flex gap-2"><span className="w-20">Pazartesi</span><span>08:30 - 17:30</span></li>
                    <li className="flex gap-2"><span className="w-20">Salı</span><span>08:30 - 17:30</span></li>
                    <li className="flex gap-2"><span className="w-20">Çarşamba</span><span>08:30 - 17:30</span></li>
                    <li className="flex gap-2"><span className="w-20">Perşembe</span><span>08:30 - 17:30</span></li>
                    <li className="flex gap-2"><span className="w-20">Cuma</span><span>08:30 - 17:30</span></li>
                    <li className="flex gap-2"><span className="w-20">Cumartesi</span><span className="text-error">Kapalı</span></li>
                    <li className="flex gap-2"><span className="w-20">Pazar</span><span className="text-error">Kapalı</span></li>
                  </ul>
                </div>
              </div>
              </div>
            </div>

          </div>

          {/* Contact Form */}
          <div className="h-full">
            <div className="rounded-xl border border-border bg-white p-6 h-full min-h-[480px] flex flex-col">
              <h2 className="text-lg font-semibold text-text-dark mb-4">Bize Yazın</h2>
              <ContactForm />
            </div>
          </div>
        </div>

        {/* Google Maps — full width */}
        <div className="mt-8 rounded-xl border border-border bg-white overflow-hidden">
          <div className="h-[400px] w-full bg-bg-light">
            <iframe
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d12042.123456789!2d32.85!3d39.92!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2zMznCsDU1JzEyLjAiTiAzMsKwNTEnMDAuMCJF!5e0!3m2!1str!2str!4v1700000000000"
              width="100%"
              height="100%"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title="Konum"
            />
          </div>
        </div>
      </div>
    </>
  );
}
