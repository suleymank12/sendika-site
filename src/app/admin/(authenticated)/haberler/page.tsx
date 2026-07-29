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
import ListLoadError from "@/components/admin/ListLoadError";
import StatusBadge from "@/components/admin/StatusBadge";
import DeleteModal from "@/components/admin/DeleteModal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Loading from "@/components/ui/Loading";
import { Plus, Newspaper } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { News } from "@/types";
import toast from "react-hot-toast";

export default function AdminNewsListPage() {
  const router = useRouter();
  const { tenant } = useTenant();
  const [news, setNews] = useState<News[]>([]);
  const [loading, setLoading] = useState(true);
  // Fetch hatasi "bos liste" olarak GOSTERILMEZ — kullanici verisinin
  // silindigini sanir (Tur 3 b1). Hata durumunda ListLoadError cikar.
  const [loadFailed, setLoadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [deleteItem, setDeleteItem] = useState<News | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchNews = async () => {
    if (!tenant) return;
    const supabase = createClient();
    let query = supabase
      .from("news")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    if (filter === "published") {
      query = query.eq("is_published", true);
    } else if (filter === "draft") {
      query = query.eq("is_published", false);
    }

    const { data, error } = await query;
    if (error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setNews(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchNews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, filter, tenant]);

  const handleDelete = async () => {
    if (!deleteItem || !tenant) return;
    setDeleting(true);

    // 1) Cover image path'i DB silmeden ONCE yakala
    const coverPath = storagePathFromUrl(deleteItem.cover_image);

    const supabase = createClient();

    // 2) Haberi sil
    const { error } = await supabase
      .from("news")
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
    const galleryPaths = await purgeContentMedia(supabase, tenant.id, "news", deleteItem.id);

    // 4) Storage temizligi (cover + galeri, tek cagri, best-effort)
    await removeFilesFromStorage(supabase, "images", [coverPath, ...galleryPaths]);

    // 5) Manset temizligi (Tur 3 / P4-iii): yardim metni bunu zaten vaat
    // ediyor (help-content "silersen mansetten de otomatik kalkar") —
    // eskiden yapilmiyor, anasayfada linksiz yetim manset kaliyordu.
    const { error: headlineError } = await supabase
      .from("headlines")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("source_type", "news")
      .eq("source_id", deleteItem.id);
    if (headlineError) {
      toast.error("Haber silindi ancak manşet kaydı kaldırılamadı — Manşet sayfasından silebilirsiniz.");
    }

    toast.success("Haber silindi.");
    setNews((prev) => prev.filter((n) => n.id !== deleteItem.id));
    setDeleteItem(null);
    setDeleting(false);
  };

  const columns: Column<News>[] = [
    {
      key: "title",
      label: "Başlık",
      render: (item) => (
        <span className="font-medium text-text-dark">{item.title}</span>
      ),
    },
    {
      key: "category",
      label: "Kategori",
      className: "hidden md:table-cell",
      render: (item) => (
        <span className="text-text-muted">{item.category || "-"}</span>
      ),
    },
    {
      key: "is_published",
      label: "Durum",
      render: (item) => <StatusBadge published={item.is_published} />,
    },
    {
      key: "created_at",
      label: "Tarih",
      className: "hidden sm:table-cell",
      render: (item) => (
        <span className="text-text-muted text-xs">{formatDate(item.created_at)}</span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader title="Haberler" helpTopic="haberler" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          {/* Top bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 w-40">
              <Select
                value={filter}
                onChange={(e) => setFilter(e.target.value as typeof filter)}
              >
                <option value="all">Tümü</option>
                <option value="published">Yayında</option>
                <option value="draft">Taslak</option>
              </Select>
            </div>
            <Button onClick={() => router.push("/admin/haberler/yeni")}>
              <Plus className="h-4 w-4" />
              Yeni Haber
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : loadFailed ? (
            <ListLoadError onRetry={fetchNews} />
          ) : news.length === 0 && !search ? (
            <EmptyState
              icon={Newspaper}
              title="Henüz haber eklenmemiş"
              description="İlk haberi eklemek için 'Yeni Haber' butonuna tıklayın."
              actionLabel="Yeni Haber"
              onAction={() => router.push("/admin/haberler/yeni")}
            />
          ) : (
            <DataTable
              columns={columns}
              data={news}
              onEdit={(item) => router.push(`/admin/haberler/${item.id}`)}
              onDelete={(item) => setDeleteItem(item)}
              onSearch={setSearch}
              searchValue={search}
              searchPlaceholder="Haber ara..."
            />
          )}
        </div>
      </div>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.title}" başlıklı haberi silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
