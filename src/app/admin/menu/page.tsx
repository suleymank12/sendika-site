"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, GripVertical, Edit, Trash2, Menu as MenuIcon } from "lucide-react";
import { MenuItem } from "@/types";
import toast from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface MenuFormData {
  id?: string;
  title: string;
  url: string;
  parent_id: string | null;
  order: number;
  is_active: boolean;
}

const emptyForm: MenuFormData = {
  title: "",
  url: "",
  parent_id: null,
  order: 0,
  is_active: true,
};

function SortableMenuItem({
  item,
  children: subItems,
  onEdit,
  onDelete,
}: {
  item: MenuItem;
  children: MenuItem[];
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 mb-1.5">
        <button {...attributes} {...listeners} className="cursor-grab text-text-muted hover:text-text-dark">
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-dark">{item.title}</span>
          {item.url && <span className="ml-2 text-xs text-text-muted">{item.url}</span>}
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full", item.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
          {item.is_active ? "Aktif" : "Pasif"}
        </span>
        <button onClick={() => onEdit(item)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10">
          <Edit className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(item)} className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {subItems.length > 0 && (
        <div className="ml-8 border-l-2 border-border pl-2">
          {subItems.map((sub) => (
            <div key={sub.id} className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 mb-1.5">
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-text-dark">{sub.title}</span>
                {sub.url && <span className="ml-2 text-xs text-text-muted">{sub.url}</span>}
              </div>
              <span className={cn("text-xs px-2 py-0.5 rounded-full", sub.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning")}>
                {sub.is_active ? "Aktif" : "Pasif"}
              </span>
              <button onClick={() => onEdit(sub)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10">
                <Edit className="h-4 w-4" />
              </button>
              <button onClick={() => onDelete(sub)} className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminMenuPage() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MenuFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("menu_items")
      .select("*")
      .order("order", { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const parentItems = items.filter((i) => !i.parent_id);
  const getChildren = (parentId: string) => items.filter((i) => i.parent_id === parentId).sort((a, b) => a.order - b.order);

  const handleEdit = (item: MenuItem) => {
    setForm({
      id: item.id,
      title: item.title,
      url: item.url || "",
      parent_id: item.parent_id,
      order: item.order,
      is_active: item.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      title: form.title.trim(),
      url: form.url.trim() || null,
      parent_id: form.parent_id || null,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("menu_items").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("menu_items").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Menü öğesi güncellendi." : "Menü öğesi eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchItems();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();

    // Alt menüleri de sil
    const children = items.filter((i) => i.parent_id === deleteItem.id);
    if (children.length > 0) {
      await supabase.from("menu_items").delete().eq("parent_id", deleteItem.id);
    }

    const { error } = await supabase.from("menu_items").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Menü öğesi silindi.");
      fetchItems();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = parentItems.findIndex((i) => i.id === active.id);
    const newIndex = parentItems.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(parentItems, oldIndex, newIndex);
    // Optimistic update
    const updatedItems = items.map((item) => {
      const idx = reordered.findIndex((r) => r.id === item.id);
      if (idx !== -1) return { ...item, order: idx };
      return item;
    });
    setItems(updatedItems);

    // Persist
    const supabase = createClient();
    const updates = reordered.map((item, idx) =>
      supabase.from("menu_items").update({ order: idx }).eq("id", item.id)
    );
    await Promise.all(updates);
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Menü Yönetimi" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">Menü öğelerini sürükleyerek sıralayabilirsiniz.</p>
            <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
              <Plus className="h-4 w-4" />
              Yeni Menü Öğesi
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : parentItems.length === 0 ? (
            <EmptyState
              icon={MenuIcon}
              title="Henüz menü öğesi yok"
              description="Yeni menü öğesi ekleyerek başlayın."
              actionLabel="Yeni Menü Öğesi"
              onAction={() => { setForm(emptyForm); setModalOpen(true); }}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={parentItems.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {parentItems.map((item) => (
                  <SortableMenuItem
                    key={item.id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={setDeleteItem}
                  >
                    {getChildren(item.id)}
                  </SortableMenuItem>
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Menü Öğesi Düzenle" : "Yeni Menü Öğesi"}>
        <div className="space-y-4">
          <Input
            id="menu-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Menü başlığı"
            required
          />
          <Input
            id="menu-url"
            label="URL"
            value={form.url}
            onChange={(e) => setForm({ ...form, url: e.target.value })}
            placeholder="/sayfa-yolu"
            helperText="Boş bırakılırsa sadece dropdown parent olur"
          />
          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">Üst Menü</label>
            <select
              value={form.parent_id || ""}
              onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="">Ana Menü (Üst seviye)</option>
              {parentItems.filter((i) => i.id !== form.id).map((item) => (
                <option key={item.id} value={item.id}>{item.title}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              id="menu-order"
              label="Sıra"
              type="number"
              value={String(form.order)}
              onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
            />
            <div>
              <label className="block text-sm font-medium text-text-dark mb-1">Durum</label>
              <select
                value={form.is_active ? "true" : "false"}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </select>
            </div>
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
        description={`"${deleteItem?.title}" menü öğesini silmek istediğinize emin misiniz?${items.some((i) => i.parent_id === deleteItem?.id) ? " Alt menü öğeleri de silinecektir." : ""}`}
      />
    </>
  );
}
