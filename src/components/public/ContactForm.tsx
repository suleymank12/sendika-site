"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import toast from "react-hot-toast";

export default function ContactForm() {
  const [ad, setAd] = useState("");
  const [email, setEmail] = useState("");
  const [telefon, setTelefon] = useState("");
  const [mesaj, setMesaj] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — gercek kullanici doldurmaz
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Client-side validation (UX icin — ASIL koruma server'da /api/contact)
    if (!ad.trim() || !email.trim() || !telefon.trim() || !mesaj.trim()) {
      toast.error("Lütfen tüm alanları doldurun.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("Geçerli bir e-posta adresi girin.");
      return;
    }

    setSending(true);
    try {
      // tenant_id GONDERMIYORUZ — server hostname'den kendi belirliyor (guvenlik).
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ad: ad.trim(),
          email: email.trim(),
          telefon: telefon.trim(),
          mesaj: mesaj.trim(),
          website, // honeypot
        }),
      });

      if (res.ok) {
        toast.success("Mesajınız alındı. En kısa sürede dönüş yapacağız.");
        setAd("");
        setEmail("");
        setTelefon("");
        setMesaj("");
        setWebsite("");
      } else if (res.status === 429) {
        toast.error("Çok fazla mesaj gönderdiniz, lütfen daha sonra tekrar deneyin.");
      } else if (res.status === 400) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Lütfen bilgileri kontrol edin.");
      } else {
        toast.error("Bir hata oluştu, lütfen tekrar deneyin.");
      }
    } catch {
      toast.error("Bir hata oluştu, lütfen tekrar deneyin.");
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col">
      <Input
        id="contact-name"
        label="Adınız Soyadınız"
        value={ad}
        onChange={(e) => setAd(e.target.value)}
        placeholder="Adınız Soyadınız"
        maxLength={100}
        required
      />
      <Input
        id="contact-email"
        label="E-posta Adresiniz"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ornek@email.com"
        maxLength={150}
        required
      />
      <Input
        id="contact-phone"
        label="Telefon"
        type="tel"
        value={telefon}
        onChange={(e) => setTelefon(e.target.value)}
        placeholder="05XX XXX XX XX"
        maxLength={30}
        required
      />
      <div className="flex-1 flex flex-col min-h-[140px]">
        <label htmlFor="contact-message" className="block text-sm font-medium text-text-dark mb-1">
          Mesajınız
        </label>
        <textarea
          id="contact-message"
          value={mesaj}
          onChange={(e) => setMesaj(e.target.value)}
          placeholder="Mesajınızı yazın..."
          maxLength={2000}
          className="w-full flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-dark placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
          required
        />
      </div>

      {/* HONEYPOT — bot tuzagi. Gercek kullanici gormez (ekran disi + aria-hidden).
          Bot bu alani doldurursa server mesaji sessizce yok sayar. */}
      <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="contact-website">Bu alanı boş bırakın</label>
        <input
          id="contact-website"
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <Button type="submit" loading={sending} className="w-full sm:w-auto">
        Gönder
      </Button>
    </form>
  );
}
