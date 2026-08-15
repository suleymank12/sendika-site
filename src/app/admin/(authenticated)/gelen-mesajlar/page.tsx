"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import AdminHeader from "@/components/admin/AdminHeader";
import ListLoadError from "@/components/admin/ListLoadError";
import DeleteModal from "@/components/admin/DeleteModal";
import Modal from "@/components/ui/Modal";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Inbox, Mail, Trash2 } from "lucide-react";
import { formatDateTime, truncateText, cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface ContactMessage {
  id: string;
  tenant_id: string;
  ad: string;
  email: string;
  telefon: string;
  mesaj: string;
  okundu: boolean;
  created_at: string;
}

// Sidebar okunmamis badge'inin yenilenmesi icin sinyal (poll yok).
function notifyMessagesUpdated() {
  window.dispatchEvent(new Event("contact-messages-updated"));
}

export default function GelenMesajlarPage() {
  const { tenant } = useTenant();
  const [items, setItems] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  // Fetch hatasi "Henuz mesaj yok" olarak GOSTERILMEZ (Tur 3 b1) — gelen
  // mesajin kayboldugunu sanmak bu panelin en hassas destek senaryosu.
  const [loadFailed, setLoadFailed] = useState(false);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [deleteItem, setDeleteItem] = useState<ContactMessage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    if (!tenant) return;
    const supabase = createClient();
    // RLS zaten tenant'a gore filtreler; explicit .eq mevcut admin pattern'i ile tutarli.
    const { data, error } = await supabase
      .from("contact_messages")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });
    if (error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setItems((data as ContactMessage[]) || []);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Detay ac; okunmamissa okundu=true isaretle
  const openDetail = async (item: ContactMessage) => {
    setSelected(item);
    if (!item.okundu && tenant) {
      const supabase = createClient();
      const { error } = await supabase
        .from("contact_messages")
        .update({ okundu: true })
        .eq("tenant_id", tenant.id)
        .eq("id", item.id);
      if (!error) {
        setItems((prev) =>
          prev.map((m) => (m.id === item.id ? { ...m, okundu: true } : m))
        );
        setSelected((prev) => (prev ? { ...prev, okundu: true } : prev));
        notifyMessagesUpdated();
      }
    }
  };

  const handleDelete = async () => {
    if (!deleteItem || !tenant) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("contact_messages")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
      setDeleting(false);
      return;
    }
    toast.success("Mesaj silindi.");
    setItems((prev) => prev.filter((m) => m.id !== deleteItem.id));
    setDeleteItem(null);
    setDeleting(false);
    notifyMessagesUpdated();
  };

  const unreadCount = items.filter((m) => !m.okundu).length;

  return (
    <>
      <AdminHeader title="Gelen Mesajlar" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : loadFailed ? (
            <ListLoadError onRetry={fetchData} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Henüz mesaj yok"
              description="İletişim formundan gönderilen mesajlar burada listelenir."
            />
          ) : (
            <>
              {unreadCount > 0 && (
                <p className="text-sm text-text-muted mb-3">
                  <span className="font-semibold text-text-dark">{unreadCount}</span> okunmamış mesaj
                </p>
              )}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-bg-light">
                      <th className="px-4 py-3 w-8" />
                      <th className="px-4 py-3 text-left font-medium text-text-muted">Gönderen</th>
                      <th className="px-4 py-3 text-left font-medium text-text-muted hidden md:table-cell">Mesaj</th>
                      <th className="px-4 py-3 text-left font-medium text-text-muted hidden sm:table-cell">Eklenme</th>
                      <th className="px-4 py-3 text-right font-medium text-text-muted w-16">İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => openDetail(item)}
                        className={cn(
                          "border-b border-border last:border-0 cursor-pointer hover:bg-bg-light/50 transition-colors",
                          !item.okundu && "bg-primary/[0.03]"
                        )}
                      >
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "block h-2 w-2 rounded-full",
                              item.okundu ? "bg-transparent" : "bg-primary"
                            )}
                            title={item.okundu ? "Okundu" : "Okunmadı"}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn("block text-text-dark", !item.okundu && "font-semibold")}>
                            {item.ad}
                          </span>
                          <span className="block text-xs text-text-muted">{item.email}</span>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-text-muted">
                          {truncateText(item.mesaj, 60)}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-text-muted text-xs whitespace-nowrap">
                          {formatDateTime(item.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteItem(item);
                              }}
                              className="rounded-lg p-1.5 text-text-muted hover:bg-error/10 hover:text-error transition-colors"
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
            </>
          )}
        </div>
      </div>

      {/* Detay modal */}
      <Modal
        isOpen={!!selected}
        onClose={() => setSelected(null)}
        title="Mesaj Detayı"
        className="max-w-xl"
        // Salt-okunur detay — form yok, kayip riski yok; kacis kolay olmali.
        closeOnOverlay
      >
        {selected && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-text-muted mb-0.5">Gönderen</p>
                <p className="text-sm font-medium text-text-dark">{selected.ad}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">Tarih</p>
                <p className="text-sm text-text-dark">{formatDateTime(selected.created_at)}</p>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">E-posta</p>
                <a href={`mailto:${selected.email}`} className="text-sm text-primary hover:underline break-all">
                  {selected.email}
                </a>
              </div>
              <div>
                <p className="text-xs text-text-muted mb-0.5">Telefon</p>
                <a href={`tel:${selected.telefon}`} className="text-sm text-primary hover:underline">
                  {selected.telefon}
                </a>
              </div>
            </div>

            <div>
              <p className="text-xs text-text-muted mb-1">Mesaj</p>
              {/* DUZ METIN — dangerouslySetInnerHTML KULLANILMAZ (XSS korumasi).
                  React {selected.mesaj} ile otomatik escape eder. */}
              <div className="rounded-lg border border-border bg-bg-light p-3 text-sm text-text-dark whitespace-pre-wrap break-words">
                {selected.mesaj}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <Button
                variant="danger"
                onClick={() => {
                  const d = selected;
                  setSelected(null);
                  setDeleteItem(d);
                }}
              >
                <Trash2 className="h-4 w-4" />
                Sil
              </Button>
              <div className="flex gap-2">
                <a href={`mailto:${selected.email}`}>
                  <Button variant="secondary">
                    <Mail className="h-4 w-4" />
                    Yanıtla
                  </Button>
                </a>
                <Button variant="primary" onClick={() => setSelected(null)}>
                  Kapat
                </Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.ad}" adlı kişiden gelen mesajı silmek istediğinize emin misiniz? Bu işlem geri alınamaz.`}
      />
    </>
  );
}
