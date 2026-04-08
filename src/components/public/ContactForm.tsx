"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import toast from "react-hot-toast";

export default function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !email.trim() || !subject.trim() || !message.trim()) {
      toast.error("Lütfen tüm alanları doldurun.");
      return;
    }

    setSending(true);
    // Placeholder — gerçek backend entegrasyonu sonra yapılabilir
    await new Promise((r) => setTimeout(r, 1000));
    toast.success("Mesajınız gönderildi. En kısa sürede dönüş yapacağız.");
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
    setSending(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 flex-1 flex flex-col">
      <Input
        id="contact-name"
        label="Adınız Soyadınız"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Adınız Soyadınız"
        required
      />
      <Input
        id="contact-email"
        label="E-posta Adresiniz"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="ornek@email.com"
        required
      />
      <Input
        id="contact-subject"
        label="Konu"
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder="Mesajınızın konusu"
        required
      />
      <div className="flex-1 flex flex-col min-h-[140px]">
        <label htmlFor="contact-message" className="block text-sm font-medium text-text-dark mb-1">
          Mesajınız
        </label>
        <textarea
          id="contact-message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Mesajınızı yazın..."
          className="w-full flex-1 rounded-lg border border-border px-3 py-2 text-sm text-text-dark placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary resize-none"
          required
        />
      </div>
      <Button type="submit" loading={sending} className="w-full sm:w-auto">
        Gönder
      </Button>
    </form>
  );
}
