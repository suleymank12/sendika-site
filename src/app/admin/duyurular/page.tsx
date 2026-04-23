"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import DataTable, { Column } from "@/components/admin/DataTable";
import StatusBadge from "@/components/admin/StatusBadge";
import DeleteModal from "@/components/admin/DeleteModal";
import Button from "@/components/ui/Button";
import Select from "@/components/ui/Select";
import Loading from "@/components/ui/Loading";
import { Plus, Megaphone } from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { formatDate } from "@/lib/utils";
import { Announcement } from "@/types";
import toast from "react-hot-toast";

export default function AdminAnnouncementsListPage() {
  const router = useRouter();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "published" | "draft">("all");
  const [deleteItem, setDeleteItem] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    const supabase = createClient();
    let query = supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });

    if (search) {
      query = query.ilike("title", `%${search}%`);
    }

    if (filter === "published") {
      query = query.eq("is_published", true);
    } else if (filter === "draft") {
      query = query.eq("is_published", false);
    }

    const { data } = await query;
    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [search, filter]);

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);

    const supabase = createClient();
    const { error } = await supabase.from("announcements").delete().eq("id", deleteItem.id);

    if (error) {
      toast.error("Silme işlemi başarısız oldu.");
    } else {
      toast.success("Duyuru silindi.");
      setItems((prev) => prev.filter((n) => n.id !== deleteItem.id));
    }

    setDeleteItem(null);
    setDeleting(false);
  };

  const columns: Column<Announcement>[] = [
    {
      key: "title",
      label: "Başlık",
      render: (item) => (
        <span className="font-medium text-text-dark">{item.title}</span>
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
      <AdminHeader title="Duyurular" />
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
            <Button onClick={() => router.push("/admin/duyurular/yeni")}>
              <Plus className="h-4 w-4" />
              Yeni Duyuru
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : items.length === 0 && !search ? (
            <EmptyState
              icon={Megaphone}
              title="Henüz duyuru eklenmemiş"
              description="İlk duyuruyu eklemek için 'Yeni Duyuru' butonuna tıklayın."
              actionLabel="Yeni Duyuru"
              onAction={() => router.push("/admin/duyurular/yeni")}
            />
          ) : (
            <DataTable
              columns={columns}
              data={items}
              onEdit={(item) => router.push(`/admin/duyurular/${item.id}`)}
              onDelete={(item) => setDeleteItem(item)}
              onSearch={setSearch}
              searchValue={search}
              searchPlaceholder="Duyuru ara..."
            />
          )}
        </div>
      </div>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.title}" başlıklı duyuruyu silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
