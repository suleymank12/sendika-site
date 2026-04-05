"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import DataTable, { Column } from "@/components/admin/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Building2 } from "lucide-react";
import { Branch } from "@/types";
import toast from "react-hot-toast";

interface BranchFormData {
  id?: string;
  name: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  is_active: boolean;
  order: number;
}

const emptyForm: BranchFormData = {
  name: "",
  city: "",
  address: "",
  phone: "",
  email: "",
  is_active: true,
  order: 0,
};

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BranchFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchBranches = useCallback(async () => {
    const supabase = createClient();
    let query = supabase.from("branches").select("*").order("order", { ascending: true });
    if (search) {
      query = query.ilike("name", `%${search}%`);
    }
    const { data } = await query;
    setBranches(data || []);
    setLoading(false);
  }, [search]);

  useEffect(() => {
    fetchBranches();
  }, [fetchBranches]);

  const handleEdit = (item: Branch) => {
    setForm({
      id: item.id,
      name: item.name,
      city: item.city || "",
      address: item.address || "",
      phone: item.phone || "",
      email: item.email || "",
      is_active: item.is_active,
      order: item.order,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Şube adı zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      is_active: form.is_active,
      order: form.order,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("branches").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("branches").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Şube güncellendi." : "Şube eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchBranches();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("branches").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Şube silindi.");
      fetchBranches();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const columns: Column<Branch>[] = [
    {
      key: "name",
      label: "Şube Adı",
      render: (item) => <span className="font-medium text-text-dark">{item.name}</span>,
    },
    {
      key: "city",
      label: "Şehir",
      className: "hidden md:table-cell",
      render: (item) => <span className="text-text-muted">{item.city || "-"}</span>,
    },
    {
      key: "phone",
      label: "Telefon",
      className: "hidden lg:table-cell",
      render: (item) => <span className="text-text-muted">{item.phone || "-"}</span>,
    },
    {
      key: "is_active",
      label: "Durum",
      render: (item) => (
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${item.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {item.is_active ? "Aktif" : "Pasif"}
        </span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader title="Şubeler" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
              <Plus className="h-4 w-4" />
              Yeni Şube Ekle
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : branches.length === 0 && !search ? (
            <EmptyState
              icon={Building2}
              title="Henüz şube eklenmemiş"
              description="Şubeleri eklemek için başlayın."
              actionLabel="Yeni Şube Ekle"
              onAction={() => { setForm(emptyForm); setModalOpen(true); }}
            />
          ) : (
            <DataTable
              columns={columns}
              data={branches}
              onEdit={handleEdit}
              onDelete={(item) => setDeleteItem(item)}
              onSearch={setSearch}
              searchValue={search}
              searchPlaceholder="Şube ara..."
            />
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Şube Düzenle" : "Yeni Şube Ekle"}>
        <div className="space-y-4">
          <Input
            id="branch-name"
            label="Şube Adı"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ankara 1 No'lu Şube"
            required
          />
          <Input
            id="branch-city"
            label="Şehir"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Ankara"
          />
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Adres</label>
            <textarea
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              rows={2}
              placeholder="Açık adres"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="branch-phone"
              label="Telefon"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+90 (312) 000 00 00"
            />
            <Input
              id="branch-email"
              label="E-posta"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="sube@sendika.org.tr"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
            <Button onClick={handleSave} loading={saving}>Kaydet</Button>
          </div>
        </div>
      </Modal>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.name}" şubesini silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
