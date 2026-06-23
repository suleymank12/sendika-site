"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Plus, Search, Edit, Trash2, Building2, Power, PowerOff, ExternalLink } from "lucide-react";
import { formatDate, buildTenantAdminUrl } from "@/lib/utils";
import toast from "react-hot-toast";
import DeleteModal from "@/components/admin/DeleteModal";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  custom_domain: string | null;
  created_at: string;
}

export default function SuperAdminTenantsPage() {
  const router = useRouter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteItem, setDeleteItem] = useState<Tenant | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchTenants = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("tenants")
      .select("*")
      .order("created_at", { ascending: false });
    setTenants((data as Tenant[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const filtered = tenants.filter((t) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.custom_domain || "").toLowerCase().includes(q)
    );
  });

  const handleToggle = async (item: Tenant) => {
    if (togglingId) return; // Çift tıklama / yarış önleme
    setTogglingId(item.id);

    // Durum değiştirme artık server endpoint'ten (Sprint 3.1 disiplini):
    // super admin guard + default tenant guard server'da zorlanıyor.
    const response = await fetch("/api/super-admin/toggle-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: item.id, isActive: !item.is_active }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(data?.error || "Durum güncellenemedi.");
      setTogglingId(null);
      return;
    }

    setTenants((prev) =>
      prev.map((t) => (t.id === item.id ? { ...t, is_active: !t.is_active } : t))
    );
    toast.success(item.is_active ? "Tenant pasife alındı." : "Tenant aktife alındı.");
    setTogglingId(null);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);

    // Tenant silme artik server endpoint'ten yapiliyor: hem yetim auth.users
    // temizligi (sole-tenant kullanicilar) hem de super admin / default
    // guard'lari server'da zorlaniyor.
    const response = await fetch("/api/super-admin/delete-tenant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: deleteItem.id }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      toast.error(
        data?.error || "Silme başarısız. Bu tenant'a bağlı içerikler olabilir."
      );
      setDeleting(false);
      return;
    }

    // 200 tam başarı, 207 kısmi başarı (tenant silindi, bazı user'lar temizlenemedi)
    if (response.status === 207) {
      toast.success(
        data?.message ||
          "Tenant silindi ancak bazı kullanıcı hesapları temizlenemedi."
      );
    } else {
      toast.success("Tenant silindi.");
    }

    setTenants((prev) => prev.filter((t) => t.id !== deleteItem.id));
    setDeleteItem(null);
    setDeleting(false);
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h1 className="text-2xl font-bold text-text-dark tracking-tight">Tenant&apos;lar</h1>
          <p className="text-sm text-text-muted mt-1">
            Platformdaki tüm kuruluşları yönetin.
          </p>
        </div>
        <Link
          href="/super-admin/tenants/yeni"
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 text-white px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Yeni Tenant
        </Link>
      </div>

      <div className="rounded-xl bg-white border border-border p-5">
        {/* Search */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tenant ara (isim, subdomain, custom domain)..."
            className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {loading ? (
          <p className="text-sm text-text-muted py-8 text-center">Yükleniyor...</p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <Building2 className="h-12 w-12 opacity-30 mb-2" />
            <p className="text-sm">
              {search ? "Aramayla eşleşen tenant yok." : "Henüz tenant eklenmemiş."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border">
                  <th className="text-left font-semibold py-2.5 pr-3">İsim</th>
                  <th className="text-left font-semibold py-2.5 pr-3">Subdomain</th>
                  <th className="text-left font-semibold py-2.5 pr-3">Durum</th>
                  <th className="text-left font-semibold py-2.5 pr-3 hidden lg:table-cell">
                    Oluşturulma
                  </th>
                  <th className="text-right font-semibold py-2.5 pl-3">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0 hover:bg-bg-light/50">
                    <td className="py-3 pr-3">
                      <Link
                        href={`/super-admin/tenants/${t.id}`}
                        className="font-medium text-text-dark hover:text-primary transition-colors"
                      >
                        {t.name}
                      </Link>
                      {t.custom_domain && (
                        <p className="text-xs text-text-muted mt-0.5">{t.custom_domain}</p>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-text-muted font-mono text-xs">{t.slug}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={
                          "text-xs px-2 py-0.5 rounded-full font-medium " +
                          (t.is_active
                            ? "bg-success/10 text-success"
                            : "bg-warning/10 text-warning")
                        }
                      >
                        {t.is_active ? "Aktif" : "Pasif"}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-xs text-text-muted hidden lg:table-cell">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {t.is_active ? (
                          <a
                            href={buildTenantAdminUrl(t.slug, t.custom_domain)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 transition-colors"
                            title="Admin paneline gir (yeni sekmede)"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <span
                            className="p-1.5 text-text-muted/30 cursor-not-allowed"
                            title="Pasif tenant — admin paneline erişilemez"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </span>
                        )}
                        <button
                          onClick={() => handleToggle(t)}
                          disabled={t.slug === "default" || togglingId === t.id}
                          className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10 disabled:text-text-muted/30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-text-muted/30"
                          title={
                            t.slug === "default"
                              ? "Default tenant pasiflenemez (sistem için gerekli)"
                              : togglingId === t.id
                                ? "Güncelleniyor..."
                                : t.is_active
                                  ? "Pasife al"
                                  : "Aktife al"
                          }
                        >
                          {t.is_active ? (
                            <PowerOff className="h-4 w-4" />
                          ) : (
                            <Power className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          onClick={() => router.push(`/super-admin/tenants/${t.id}`)}
                          className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10"
                          title="Düzenle"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteItem(t)}
                          className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
                          title="Sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={
          deleteItem
            ? `"${deleteItem.name}" tenant'ını silmek üzeresiniz. Bu işlem tenant'a bağlı TÜM içerikleri (haberler, duyurular, sayfalar, ayarlar vb.) ve YALNIZCA bu tenant'a bağlı admin kullanıcı hesaplarını kalıcı olarak siler. Bu işlem geri alınamaz!`
            : ""
        }
      />
    </div>
  );
}
