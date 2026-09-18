"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  storagePathFromUrl,
  removeFilesFromStorage,
  purgeContentMedia,
} from "@/lib/storage";
import { useTenant } from "@/hooks/useTenant";
import { useAdminList, PAGE_PARAM } from "@/hooks/useAdminList";
import AdminHeader from "@/components/admin/AdminHeader";
import DataTable, { Column } from "@/components/admin/DataTable";
import ListLoadError from "@/components/admin/ListLoadError";
import StatusBadge from "@/components/admin/StatusBadge";
import DeleteModal from "@/components/admin/DeleteModal";
import Button from "@/components/ui/Button";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, FileText } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { KURUMSAL_PAGE_SLUGS } from "@/lib/constants";
import { Page } from "@/types";
import toast from "react-hot-toast";

/**
 * Liste kolonlari (b1) — `select("*")` DEGIL. `cover_image` ekranda yok ama
 * silme akisi storage temizligi icin okuyor. `content` (tuzuk gibi sayfalarda
 * cok uzun) bilerek cekilmiyor: 40 satirda 394 kB -> 6.8 kB.
 */
const LIST_COLUMNS = "id, title, slug, is_published, updated_at, cover_image";

export default function AdminPagesListPage() {
  return (
    <>
      <AdminHeader
        title="Sayfalar"
        description="Hakkımızda, Tüzük gibi kendi adresi olan sayfalar. Menüye elle eklenir."
        helpTopic="sayfalar"
      />
      {/* useSearchParams (useAdminList) Next 14'te <Suspense> siniri ister. */}
      <Suspense
        fallback={
          <div className="p-4 lg:p-6">
            <Loading className="py-12" text="Yükleniyor..." />
          </div>
        }
      >
        <PagesListContent />
      </Suspense>
    </>
  );
}

function PagesListContent() {
  const router = useRouter();
  const { tenant } = useTenant();
  const [deleteItem, setDeleteItem] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    items: pages,
    loading,
    // Fetch hatasi "bos liste" olarak GOSTERILMEZ (Tur 3 b1) — ListLoadError.
    loadFailed,
    total,
    page,
    totalPages,
    search,
    setSearch,
    searching,
    goToPage,
    refetch,
  } = useAdminList<Page>({
    table: "pages",
    columns: LIST_COLUMNS,
    order: { column: "created_at", ascending: false },
    searchColumn: "title",
  });

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
      toast.error("Silme başarısız oldu.");
      setDeleteItem(null);
      setDeleting(false);
      return;
    }

    // 3) content_media satırlarını ELLE sil + galeri path'lerini topla (cascade YOK)
    const galleryPaths = await purgeContentMedia(supabase, tenant.id, "page", deleteItem.id);

    // 4) Storage temizligi (cover + galeri, tek cagri, best-effort)
    await removeFilesFromStorage(supabase, "images", [coverPath, ...galleryPaths]);

    toast.success("Sayfa silindi.");
    // Yerel filtreleme yerine sunucudan yeniden cek (b1).
    refetch();
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
      label: "Son Güncelleme",
      className: "hidden sm:table-cell",
      render: (item) => <span className="text-text-muted text-xs">{formatDate(item.updated_at)}</span>,
    },
  ];

  const pageSuffix = page > 1 ? `?${PAGE_PARAM}=${page}` : "";

  return (
    <>
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={() => router.push("/admin/sayfalar/yeni")}>
              <Plus className="h-4 w-4" />
              Yeni Sayfa
            </Button>
          </div>

          <p className="mb-4 rounded-lg bg-bg-light border border-border px-3 py-2 text-xs text-text-muted">
            Bilgi: URL kısa adı <b>{KURUMSAL_PAGE_SLUGS.join(", ")}</b> olan sayfalar sitedeki
            Kurumsal menüsünü besler (örn. /kurumsal/hakkimizda). Bu adları değiştirirseniz
            ilgili kurumsal sayfa boş kalır.
          </p>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : loadFailed ? (
            <ListLoadError onRetry={refetch} />
          ) : total === 0 && !search ? (
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
              onEdit={(item) => router.push(`/admin/sayfalar/${item.id}${pageSuffix}`)}
              onDelete={(item) => setDeleteItem(item)}
              onSearch={setSearch}
              searchValue={search}
              searching={searching}
              searchPlaceholder="Sayfa ara..."
              pagination={{ page, totalPages, total, onPageChange: goToPage }}
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
