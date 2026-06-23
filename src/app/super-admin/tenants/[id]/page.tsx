"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, AlertTriangle, User } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Loading from "@/components/ui/Loading";
import DeleteModal from "@/components/admin/DeleteModal";
import { formatDate } from "@/lib/utils";
import toast from "react-hot-toast";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  is_active: boolean;
  enabled_modules: { donations?: boolean; membership?: boolean };
  created_at: string;
  updated_at: string;
}

interface TenantUser {
  id: string;
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export default function TenantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const tenantId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tenant, setTenant] = useState<Tenant | null>(null);

  // Form alanları
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [originalSlug, setOriginalSlug] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [donations, setDonations] = useState(false);
  const [membership, setMembership] = useState(false);

  // Admin kullanıcılar
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [deleteUser, setDeleteUser] = useState<TenantUser | null>(null);

  const fetchTenant = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tenants")
      .select("*")
      .eq("id", tenantId)
      .single();

    if (error || !data) {
      toast.error("Tenant bulunamadı.");
      router.push("/super-admin/tenants");
      return;
    }

    const t = data as Tenant;
    setTenant(t);
    setName(t.name);
    setSlug(t.slug);
    setOriginalSlug(t.slug);
    setCustomDomain(t.custom_domain || "");
    setIsActive(t.is_active);
    setDonations(!!t.enabled_modules?.donations);
    setMembership(!!t.enabled_modules?.membership);
    setLoading(false);
  }, [tenantId, router]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    const res = await fetch(`/api/super-admin/tenant-users/list?tenantId=${tenantId}`);
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setUsers(data.users || []);
    } else {
      toast.error(data?.error || "Kullanıcılar yüklenemedi.");
    }
    setUsersLoading(false);
  }, [tenantId]);

  useEffect(() => {
    fetchTenant();
    fetchUsers();
  }, [fetchTenant, fetchUsers]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Kuruluş adı zorunludur.");
      return;
    }
    if (!slug.trim() || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      toast.error("Geçersiz subdomain.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("tenants")
      .update({
        name: name.trim(),
        slug: slug.trim().toLowerCase(),
        custom_domain: customDomain.trim().toLowerCase() || null,
        is_active: isActive,
        enabled_modules: { donations, membership },
        updated_at: new Date().toISOString(),
      })
      .eq("id", tenantId);

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        toast.error("Bu subdomain veya custom domain zaten kullanılıyor.");
      } else {
        toast.error("Kaydetme başarısız: " + error.message);
      }
      setSaving(false);
      return;
    }

    toast.success("Tenant güncellendi.");
    setOriginalSlug(slug);
    setSaving(false);
  };

  const handleAddUser = async () => {
    if (!newUserEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUserEmail)) {
      toast.error("Geçerli bir e-posta girin.");
      return;
    }
    setAddingUser(true);
    const res = await fetch("/api/super-admin/tenant-users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tenantId,
        email: newUserEmail.trim(),
        role: "admin",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Eklenemedi.");
      setAddingUser(false);
      return;
    }
    toast.success("Admin eklendi.");
    setNewUserEmail("");
    setAddingUser(false);
    fetchUsers();
  };

  const handleRemoveUser = async () => {
    if (!deleteUser) return;
    const res = await fetch(
      `/api/super-admin/tenant-users?id=${deleteUser.id}`,
      { method: "DELETE" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data?.error || "Kaldırma başarısız.");
      setDeleteUser(null);
      return;
    }

    // 200 tam başarı, 207 kısmi başarı (üyelik silindi ama hesap
    // temizlenemedi). Mesaj server'dan gelir (kaldırıldı / kaldırıldı +
    // hesap silindi / diğer tenant'larda aktif).
    if (res.status === 207) {
      toast.success(
        data?.message ||
          "Admin tenant'tan kaldırıldı ancak hesap tamamen temizlenemedi."
      );
    } else {
      toast.success(data?.message || "Admin kaldırıldı.");
    }

    setUsers((prev) => prev.filter((u) => u.id !== deleteUser.id));
    setDeleteUser(null);
  };

  if (loading || !tenant) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loading text="Yükleniyor..." />
      </div>
    );
  }

  const slugChanged = slug !== originalSlug;

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/super-admin/tenants"
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-dark hover:bg-bg-light transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Geri
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-text-dark tracking-tight truncate">
            {tenant.name}
          </h1>
          <p className="text-xs text-text-muted truncate">
            {tenant.slug} — {formatDate(tenant.created_at)}
          </p>
        </div>
      </div>

      {/* Tenant Bilgileri */}
      <div className="rounded-xl bg-white border border-border p-5 lg:p-6 space-y-5">
        <section className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            Kuruluş Bilgileri
          </p>
          <Input
            id="name"
            label="Kuruluş Adı"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
          <Input
            id="slug"
            label="Subdomain"
            value={slug}
            onChange={(e) => setSlug(e.target.value.toLowerCase())}
            required
            helperText="Sitenin adresi: subdomain.platform.com"
          />
          {slugChanged && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                Subdomain değişiyor. Mevcut kullanıcıların eski URL&apos;leri çalışmaz olur,
                arama motoru indeksleri sıfırlanır. Kaçınılmazsa devam edin.
              </p>
            </div>
          )}
          <Input
            id="custom-domain"
            label="Custom Domain (opsiyonel)"
            value={customDomain}
            onChange={(e) => setCustomDomain(e.target.value.toLowerCase())}
            placeholder="www.kurulus.org.tr"
            helperText="Kuruluş kendi alan adını bağlamak isterse buraya yazın. DNS ayarları ayrıca yapılmalı."
          />
        </section>

        <section className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            Durum
          </p>
          <Select
            label="Durum"
            value={isActive ? "true" : "false"}
            onChange={(e) => setIsActive(e.target.value === "true")}
          >
            <option value="true">Aktif (erişilebilir)</option>
            <option value="false">Pasif (erişim kapalı)</option>
          </Select>
        </section>

        <section className="space-y-3">
          <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">
            Aktif Modüller
          </p>
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
                <p className="text-xs text-text-muted">Bağış toplama modülü.</p>
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
                <p className="text-xs text-text-muted">Üye kayıt ve aidat takip.</p>
              </div>
            </label>
          </div>
        </section>

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button onClick={handleSave} loading={saving}>
            Değişiklikleri Kaydet
          </Button>
        </div>
      </div>

      {/* Admin Kullanıcılar */}
      <div className="rounded-xl bg-white border border-border p-5 lg:p-6 space-y-4">
        <div>
          <h2 className="font-semibold text-text-dark">Tenant Admin Kullanıcıları</h2>
          <p className="text-xs text-text-muted mt-1">
            Bu kuruluşun yönetim paneline erişebilecek kullanıcılar.
          </p>
        </div>

        {/* Add user */}
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="yeni-admin@kurulus.org.tr"
            className="flex-1 rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <Button onClick={handleAddUser} loading={addingUser}>
            <Plus className="h-4 w-4" />
            Admin Ekle
          </Button>
        </div>

        {/* User list */}
        {usersLoading ? (
          <p className="text-sm text-text-muted py-4 text-center">Yükleniyor...</p>
        ) : users.length === 0 ? (
          <p className="text-sm text-text-muted py-4 text-center">
            Henüz admin kullanıcı eklenmemiş.
          </p>
        ) : (
          <ul className="divide-y divide-border border border-border rounded-lg">
            {users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="rounded-full bg-primary/10 p-2">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text-dark truncate">
                    {u.email || "(e-posta yok)"}
                  </p>
                  <p className="text-xs text-text-muted">
                    {u.role} • {formatDate(u.created_at)}
                  </p>
                </div>
                <button
                  onClick={() => setDeleteUser(u)}
                  className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
                  title="Kaldır"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <DeleteModal
        isOpen={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={handleRemoveUser}
        title="Admin Kaldır"
        description={
          deleteUser
            ? `"${deleteUser.email || deleteUser.user_id}" kullanıcısını bu tenant'tan kaldırmak istediğinize emin misiniz? Eğer kullanıcı başka bir tenant'a bağlı değilse hesabı tamamen silinir. Bu işlem geri alınamaz.`
            : ""
        }
      />
    </div>
  );
}
