"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import DeleteModal from "@/components/admin/DeleteModal";
import FormField from "@/components/admin/FormField";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, Tag, GripVertical, Edit, Trash2 } from "lucide-react";
import { NewsCategory } from "@/types";
import { createSlug } from "@/lib/utils";
import toast from "react-hot-toast";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
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

interface CategoryFormData {
  id?: string;
  name: string;
  slug: string;
  is_active: boolean;
}

const emptyForm: CategoryFormData = {
  name: "",
  slug: "",
  is_active: true,
};

function SortableCategoryRow({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: NewsCategory;
  onEdit: (item: NewsCategory) => void;
  onDelete: (item: NewsCategory) => void;
  onToggle: (item: NewsCategory) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-white p-4 flex items-center gap-3">
      <button {...attributes} {...listeners} className="text-text-muted hover:text-text-dark cursor-grab touch-none">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="rounded-lg bg-primary/10 p-2 shrink-0">
        <Tag className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-dark truncate">{item.name}</p>
        {item.slug && (
          <p className="text-xs text-text-muted truncate">/{item.slug}</p>
        )}
      </div>
      <button
        onClick={() => onToggle(item)}
        className={cn(
          "text-xs px-2.5 py-1 rounded-full font-medium transition-colors shrink-0",
          item.is_active ? "bg-success/10 text-success hover:bg-success/20" : "bg-warning/10 text-warning hover:bg-warning/20"
        )}
      >
        {item.is_active ? "Aktif" : "Pasif"}
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={() => onEdit(item)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10">
          <Edit className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(item)} className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function AdminNewsCategoriesPage() {
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CategoryFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<NewsCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchCategories = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("news_categories").select("*").order("order", { ascending: true });
    setCategories(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  useEffect(() => {
    if (!slugManuallyEdited && form.name && !form.id) {
      setForm((prev) => ({ ...prev, slug: createSlug(prev.name) }));
    }
  }, [form.name, form.id, slugManuallyEdited]);

  const openNew = () => {
    setForm(emptyForm);
    setSlugManuallyEdited(false);
    setModalOpen(true);
  };

  const handleEdit = (item: NewsCategory) => {
    setForm({
      id: item.id,
      name: item.name,
      slug: item.slug || "",
      is_active: item.is_active,
    });
    setSlugManuallyEdited(true);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Kategori adı zorunludur.");
      return;
    }

    const finalSlug = form.slug.trim() || createSlug(form.name);

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      slug: finalSlug || null,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("news_categories").update(payload).eq("id", form.id));
    } else {
      payload.order = categories.length;
      ({ error } = await supabase.from("news_categories").insert(payload));
    }

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        toast.error("Bu URL kısa adı zaten kullanılıyor.");
      } else {
        toast.error("Kaydetme başarısız oldu.");
      }
    } else {
      toast.success(form.id ? "Kategori güncellendi." : "Kategori eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      setSlugManuallyEdited(false);
      fetchCategories();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("news_categories").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Kategori silindi.");
      fetchCategories();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleToggle = async (item: NewsCategory) => {
    const supabase = createClient();
    const { error } = await supabase.from("news_categories").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setCategories((prev) => prev.map((c) => (c.id === item.id ? { ...c, is_active: !c.is_active } : c)));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((c, idx) =>
        supabase.from("news_categories").update({ order: idx }).eq("id", c.id)
      )
    );
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Haber Kategorileri" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4 gap-3">
            <p className="text-sm text-text-muted">
              Haberlerin kategorilendirileceği etiketleri yönetin. Sürükleyerek sıralayabilirsiniz.
            </p>
            <Button onClick={openNew} className="shrink-0">
              <Plus className="h-4 w-4" />
              Yeni Kategori
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : categories.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="Henüz kategori eklenmemiş"
              description="Haberlerde kullanmak için kategori oluşturun."
              actionLabel="Yeni Kategori"
              onAction={openNew}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {categories.map((item) => (
                    <SortableCategoryRow
                      key={item.id}
                      item={item}
                      onEdit={handleEdit}
                      onDelete={setDeleteItem}
                      onToggle={handleToggle}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Kategori Düzenle" : "Yeni Kategori"}
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto -mx-1 px-1">
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Temel Bilgiler</p>
            <Input
              id="category-name"
              label="Kategori Adı"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Toplu Sözleşme"
              required
            />
            <Input
              id="category-slug"
              label="URL Kısa Adı"
              value={form.slug}
              onChange={(e) => {
                setForm({ ...form, slug: e.target.value });
                setSlugManuallyEdited(true);
              }}
              placeholder="toplu-sozlesme"
              helperText="Kategori adından otomatik oluşur. Sadece küçük harf ve tire kullan."
            />
          </section>

          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Durum</p>
            <FormField label="Yayın Durumu">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_active: true })}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    form.is_active
                      ? "border-success bg-success/10 text-success"
                      : "border-border bg-white text-text-muted hover:bg-bg-light"
                  )}
                >
                  Aktif
                </button>
                <button
                  type="button"
                  onClick={() => setForm({ ...form, is_active: false })}
                  className={cn(
                    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                    !form.is_active
                      ? "border-warning bg-warning/10 text-warning"
                      : "border-border bg-white text-text-muted hover:bg-bg-light"
                  )}
                >
                  Pasif
                </button>
              </div>
              <p className="text-xs text-text-muted mt-1">
                Pasif kategoriler haber formundaki listede görünmez ama mevcut haberler korunur.
              </p>
            </FormField>
          </section>
        </div>

        <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-border">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>
            {form.id ? "Değişiklikleri Kaydet" : "Kategori Ekle"}
          </Button>
        </div>
      </Modal>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.name}" kategorisini silmek istediğinize emin misiniz? Bu kategoriye atanmış mevcut haberler etkilenmez, ancak bu kategori artık haber formunda görünmez.`}
      />
    </>
  );
}
