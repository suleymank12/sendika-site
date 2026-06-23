"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  storagePathFromUrl,
  removeFilesFromStorage,
  purgeContentMedia,
} from "@/lib/storage";
import { useTenant } from "@/hooks/useTenant";
import AdminHeader from "@/components/admin/AdminHeader";
import DataTable, { Column } from "@/components/admin/DataTable";
import StatusBadge from "@/components/admin/StatusBadge";
import DeleteModal from "@/components/admin/DeleteModal";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Page } from "@/types";
import toast from "react-hot-toast";

export default function AdminPagesListPage() {
  const router = useRouter();
  const { tenant } = useTenant();
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [deleteItem, setDeleteItem] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPages = async () => {
    if (!tenant) return;
    const supabase = createClient();
    let query = supabase
      .from("pages")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });
    if (search) {
      query = query.ilike("title", `%${search}%`);
    }
    const { data } = await query;
    setPages(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, tenant]);

  const handleDelete = async () => {
    if (!deleteItem || !tenant) return;
    setDeleting(true);
    // 1) Cover image path'i DB silmeden ONCE yakala
    const coverPath = storagePathFromUrl(deleteItem.cover_image);

    const supabase = createClient();

    // 2) Sayfayi sil
    const { error } = await supabase
      .from("pages")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme işlemi başarısız oldu.");
      setDeleteItem(null);
      setDeleting(false);
      return;
    }

    // 3) content_media satırlarını ELLE sil + galeri path'lerini topla (cascade YOK)
    const galleryPaths = await purgeContentMedia(supabase, tenant.id, "page", deleteItem.id);

    // 4) Storage temizligi (cover + galeri, tek cagri, best-effort)
    await removeFilesFromStorage(supabase, "images", [coverPath, ...galleryPaths]);

    toast.success("Sayfa silindi.");
    setPages((prev) => prev.filter((p) => p.id !== deleteItem.id));
    setDeleteItem(null);
    setDeleting(false);
  };

  const columns: Column<Page>[] = [
    {
      key: "title",
      label: "Başlık",
      render: (item) => <span className="font-medium text-text-dark">{item.title}</span>,
    },
    {
      key: "slug",
      label: "Slug",
      className: "hidden md:table-cell",
      render: (item) => <span className="text-text-muted text-xs">/sayfa/{item.slug}</span>,
    },
    {
      key: "is_published",
      label: "Durum",
      render: (item) => <StatusBadge published={item.is_published} />,
    },
    {
      key: "updated_at",
      label: "Güncelleme",
      className: "hidden sm:table-cell",
      render: (item) => <span className="text-text-muted text-xs">{formatDate(item.updated_at)}</span>,
    },
  ];

  return (
    <>
      <AdminHeader title="Sayfalar" helpTopic="sayfalar" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={() => router.push("/admin/sayfalar/yeni")}>
              <Plus className="h-4 w-4" />
              Yeni Sayfa
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : pages.length === 0 && !search ? (
            <EmptyState
              icon={FileText}
              title="Henüz sayfa eklenmemiş"
              description="Hakkımızda, Tüzük gibi sayfaları buradan oluşturabilirsiniz."
              actionLabel="Yeni Sayfa"
              onAction={() => router.push("/admin/sayfalar/yeni")}
            />
          ) : (
            <DataTable
              columns={columns}
              data={pages}
              onEdit={(item) => router.push(`/admin/sayfalar/${item.id}`)}
              onDelete={(item) => setDeleteItem(item)}
              onSearch={setSearch}
              searchValue={search}
              searchPlaceholder="Sayfa ara..."
            />
          )}
        </div>
      </div>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.title}" sayfasını silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
