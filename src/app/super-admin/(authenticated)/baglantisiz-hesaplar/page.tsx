"use client";

import { useCallback, useEffect, useState } from "react";
import { Search, Trash2, UserX } from "lucide-react";
import toast from "react-hot-toast";
import DeleteModal from "@/components/admin/DeleteModal";
import ListLoadError from "@/components/admin/ListLoadError";
import Select from "@/components/ui/Select";
import { formatDate } from "@/lib/utils";
import type { OrphanUser } from "@/lib/super-admin/orphan-users";

type LoginFilter = "all" | "never" | "signed_in";

/**
 * Hiçbir kuruluşa bağlı olmayan (ve süper admin olmayan) Auth hesapları.
 * Kaynak ve kararlar: lib/super-admin/orphan-users. Silme her zaman onaylı ve
 * sunucuda silme anındaki yeniden kontrolle (api/super-admin/orphan-users).
 */
export default function BaglantisizHesaplarPage() {
  const [users, setUsers] = useState<OrphanUser[]>([]);
  const [loading, setLoading] = useState(true);
  // Fetch hatası "boş liste" olarak GÖSTERİLMEZ — ListLoadError.
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [loginFilter, setLoginFilter] = useState<LoginFilter>("all");
  const [deleteItem, setDeleteItem] = useState<OrphanUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/super-admin/orphan-users", { cache: "no-store" }).catch(
      () => null
    );
    const data = res ? await res.json().catch(() => null) : null;
    if (!res?.ok || !Array.isArray(data?.users)) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setUsers(data.users as OrphanUser[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const filtered = users.filter((u) => {
    if (loginFilter === "never" && u.last_sign_in_at) return false;
    if (loginFilter === "signed_in" && !u.last_sign_in_at) return false;
    if (!search) return true;
    return u.email.toLowerCase().includes(search.toLowerCase());
  });

  const handleDelete = async () => {
    if (!deleteItem) return;
    const target = deleteItem;
    setDeleting(true);

    const res = await fetch(
      `/api/super-admin/orphan-users?userId=${encodeURIComponent(target.id)}`,
      { method: "DELETE" }
    ).catch(() => null);
    const data = res ? await res.json().catch(() => null) : null;

    setDeleting(false);
    setDeleteItem(null);

    if (res?.ok) {
      toast.success("Hesap silindi.");
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      return;
    }
    if (res?.status === 404) {
      // Zaten silinmiş — listeden düş.
      toast.error(data?.error || "Hesap bulunamadı.");
      setUsers((prev) => prev.filter((u) => u.id !== target.id));
      return;
    }
    if (res?.status === 409) {
      // Silme anındaki kontrol: kişi bu arada bir kuruluşa bağlanmış (ya da
      // süper admin). Liste eskimiş — tazele.
      toast.error(data?.error || "Hesap silinmedi.");
      fetchUsers();
      return;
    }
    toast.error(data?.error || "Silme başarısız oldu.");
  };

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-text-dark tracking-tight">Bağlantısız Hesaplar</h1>
        <p className="text-sm text-text-muted mt-1 leading-relaxed">
          Hiçbir kuruluşa bağlı olmayan kullanıcı hesapları. Bu kişiler giriş yapabilir ama
          hiçbir yönetim paneline erişemez. Genellikle bir admin kaldırılırken ya da bir tenant
          silinirken hesap geçici bir hata yüzünden silinemediğinde oluşur. Silmek güvenlidir;
          kişiyi yeniden eklemek isterseniz ilgili tenant sayfasından ekleyin.
        </p>
      </div>

      <div className="rounded-xl bg-white border border-border p-5">
        <div className="mb-4 flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="E-posta ara..."
              className="w-full rounded-lg border border-border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="sm:w-56">
            <Select
              aria-label="Giriş durumu"
              value={loginFilter}
              onChange={(e) => setLoginFilter(e.target.value as LoginFilter)}
            >
              <option value="all">Tümü</option>
              <option value="never">Hiç giriş yapmamış</option>
              <option value="signed_in">Giriş yapmış</option>
            </Select>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-text-muted py-8 text-center">Yükleniyor...</p>
        ) : loadFailed ? (
          <ListLoadError onRetry={fetchUsers} />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <UserX className="h-12 w-12 opacity-30 mb-2" />
            <p className="text-sm">
              {users.length === 0
                ? "Bağlantısız hesap yok — tüm hesaplar bir kuruluşa bağlı."
                : "Aramayla eşleşen hesap yok."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase tracking-wider text-text-muted border-b border-border">
                  <th className="text-left font-semibold py-2.5 pr-3">E-posta</th>
                  <th className="text-left font-semibold py-2.5 pr-3">Son giriş</th>
                  <th className="text-left font-semibold py-2.5 pr-3 hidden lg:table-cell">
                    Oluşturulma
                  </th>
                  <th className="text-right font-semibold py-2.5 pl-3">İşlemler</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border last:border-0 hover:bg-bg-light/50">
                    <td className="py-3 pr-3 font-medium text-text-dark break-all">
                      {u.email || <span className="text-text-muted">(e-posta yok)</span>}
                    </td>
                    <td className="py-3 pr-3 text-xs text-text-muted">
                      {u.last_sign_in_at ? formatDate(u.last_sign_in_at) : "Hiç giriş yapmadı"}
                    </td>
                    <td className="py-3 pr-3 text-xs text-text-muted hidden lg:table-cell">
                      {u.created_at ? formatDate(u.created_at) : "—"}
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <button
                        onClick={() => setDeleteItem(u)}
                        className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
                        title="Hesabı sil"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
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
        title="Hesabı Sil"
        description={
          deleteItem
            ? `"${deleteItem.email || deleteItem.id}" hesabını kalıcı olarak silmek üzeresiniz. Kişi artık giriş yapamaz; yeniden eklenirse yeni bir davet gönderilir. Bu işlem geri alınamaz!`
            : ""
        }
      />
    </div>
  );
}
