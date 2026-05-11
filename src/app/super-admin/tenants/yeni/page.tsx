"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import FormField from "@/components/admin/FormField";
import { createSlug } from "@/lib/utils";
import toast from "react-hot-toast";

export default function NewTenantPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [plan, setPlan] = useState("basic");
  const [donations, setDonations] = useState(false);
  const [membership, setMembership] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-slug from name
  useEffect(() => {
    if (!slugManuallyEdited && name) {
      setSlug(createSlug(name));
    }
  }, [name, slugManuallyEdited]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Kuruluş adı zorunludur.");
      return;
    }
    if (!slug.trim() || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      toast.error("Geçersiz subdomain. Sadece küçük harf, rakam ve tire.");
      return;
    }
    if (!adminEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      toast.error("Geçerli bir admin e-postası girin.");
      return;
    }
    if (slug === "default" || slug === "www" || slug === "admin" || slug === "api") {
      toast.error("Bu subdomain rezerve edilmiş, başka bir tane seçin.");
      return;
    }

    setSaving(true);

    const res = await fetch("/api/super-admin/create-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        adminEmail: adminEmail.trim(),
        plan,
        enabledModules: { donations, membership },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok && res.status !== 207) {
      toast.error(data?.error || "Tenant oluşturulamadı.");
      setSaving(false);
      return;
    }

    if (res.status === 207) {
      // Kısmi başarı
      toast.success("Tenant oluşturuldu (admin bağlantısında sorun: " + (data?.error || "") + ")");
    } else {
      toast.success("Tenant başarıyla oluşturuldu. Admin'e davet gönderildi.");
    }

    if (data?.tenant?.id) {
      router.push(`/super-admin/tenants/${data.tenant.id}`);
    } else {
      router.push("/super-admin/tenants");
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/super-admin/tenants"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-dark hover:bg-bg-light transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Geri
        </Link>
        <div>
          <h1 className="text-xl font-bold text-text-dark tracking-tight">Yeni Tenant</h1>
          <p className="text-xs text-text-muted">Yeni bir kuruluş oluşturun ve adminini davet edin.</p>
        </div>
      </div>

      <div className="rounded-xl bg-white border border-border p-5 lg:p-6 space-y-5">
        {/* Kuruluş Bilgileri */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            Kuruluş Bilgileri
          </p>
          <Input
            id="tenant-name"
            label="Kuruluş Adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn: Eğitim Sen Ankara"
            required
          />
          <Input
            id="tenant-slug"
            label="Subdomain"
            value={slug}
            onChange={(e) => {
              setSlug(e.target.value.toLowerCase());
              setSlugManuallyEdited(true);
            }}
            placeholder="egitim-sen-ankara"
            helperText="Sitenin adresi: subdomain.platform.com — küçük harf, rakam ve tire kullanın."
            required
          />
        </section>

        {/* Admin */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            İlk Admin Kullanıcı
          </p>
          <Input
            id="admin-email"
            label="Admin E-posta"
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="admin@kurulus.org.tr"
            helperText="Bu e-postaya davet maili gönderilir. Kullanıcı yoksa otomatik oluşturulur."
            required
          />
        </section>

        {/* Plan ve Modüller */}
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            Plan ve Modüller
          </p>
          <Select
            label="Plan"
            value={plan}
            onChange={(e) => setPlan(e.target.value)}
          >
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </Select>

          <FormField label="Aktif Modüller">
            <div className="space-y-2">
              <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-bg-light/40 transition-colors">
                <input
                  type="checkbox"
                  checked={donations}
                  onChange={(e) => setDonations(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-dark">Bağışlar</p>
                  <p className="text-xs text-text-muted">
                    Tenant kendi POS'unu bağlayıp bağış toplayabilir.
                  </p>
                </div>
              </label>
              <label className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 cursor-pointer hover:bg-bg-light/40 transition-colors">
                <input
                  type="checkbox"
                  checked={membership}
                  onChange={(e) => setMembership(e.target.checked)}
                  className="h-4 w-4 rounded border-border text-primary focus:ring-primary/50"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-text-dark">Üyelik / Aidat</p>
                  <p className="text-xs text-text-muted">
                    Üye kayıt ve aidat takip sistemi (V3 — yakında).
                  </p>
                </div>
              </label>
            </div>
          </FormField>
        </section>

        {/* Info */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Oluşturma sonrası neler yapılır?</p>
            <ul className="mt-1 space-y-0.5 text-xs list-disc list-inside text-amber-800">
              <li>Tenant kaydı oluşturulur ve aktif edilir.</li>
              <li>Varsayılan menü, site ayarları ve renk teması kurulur.</li>
              <li>Belirtilen e-postaya davet maili gönderilir.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Save Bar */}
      <div className="flex justify-end gap-3">
        <Link
          href="/super-admin/tenants"
          className="inline-flex items-center rounded-lg border border-border bg-white px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-light transition-colors"
        >
          İptal
        </Link>
        <Button onClick={handleSubmit} loading={saving}>
          Tenant Oluştur
        </Button>
      </div>
    </div>
  );
}
