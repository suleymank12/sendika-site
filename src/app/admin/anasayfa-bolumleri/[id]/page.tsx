"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import FormField from "@/components/admin/FormField";
import ImageUploader from "@/components/admin/ImageUploader";
import { ArrowLeft, Plus, GripVertical, Edit, Trash2, LayoutGrid } from "lucide-react";
import { HomepageSection, HomepageSectionItem } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";
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

interface ItemFormData {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  order: number;
  is_active: boolean;
}

const emptyForm: ItemFormData = {
  title: "",
  description: "",
  image_url: "",
  link_url: "",
  order: 0,
  is_active: true,
};

function SortableItemRow({
  item,
  onEdit,
  onDelete,
}: {
  item: HomepageSectionItem;
  onEdit: (item: HomepageSectionItem) => void;
  onDelete: (item: HomepageSectionItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-white px-3 py-2.5 mb-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-text-muted hover:text-text-dark"
        aria-label="Sırala"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="w-14 h-10 rounded bg-bg-light overflow-hidden shrink-0 flex items-center justify-center">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.title} className="w-full h-full object-cover" />
        ) : (
          <LayoutGrid className="h-4 w-4 text-text-muted" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-text-dark truncate">{item.title}</div>
        {item.link_url && (
          <div className="text-xs text-text-muted truncate">{item.link_url}</div>
        )}
      </div>

      <span
        className={cn(
          "text-xs px-2 py-0.5 rounded-full",
          item.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
        )}
      >
        {item.is_active ? "Aktif" : "Pasif"}
      </span>

      <button
        onClick={() => onEdit(item)}
        className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10"
        title="Düzenle"
      >
        <Edit className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(item)}
        className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
        title="Sil"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function AdminSectionItemsPage() {
  const params = useParams();
  const router = useRouter();
  const sectionId = params.id as string;

  const [section, setSection] = useState<HomepageSection | null>(null);
  const [items, setItems] = useState<HomepageSectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<ItemFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<HomepageSectionItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [sectionRes, itemsRes] = await Promise.all([
      supabase.from("homepage_sections").select("*").eq("id", sectionId).single(),
      supabase
        .from("homepage_section_items")
        .select("*")
        .eq("section_id", sectionId)
        .order("order", { ascending: true }),
    ]);

    if (sectionRes.error || !sectionRes.data) {
      toast.error("Bölüm bulunamadı.");
      router.push("/admin/anasayfa-bolumleri");
      return;
    }

    setSection(sectionRes.data as HomepageSection);
    setItems((itemsRes.data as HomepageSectionItem[]) || []);
    setLoading(false);
  }, [sectionId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNew = () => {
    setForm({ ...emptyForm, order: items.length });
    setModalOpen(true);
  };

  const handleEdit = (item: HomepageSectionItem) => {
    setForm({
      id: item.id,
      title: item.title,
      description: item.description || "",
      image_url: item.image_url || "",
      link_url: item.link_url || "",
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
      section_id: sectionId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      link_url: form.link_url.trim() || null,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase
        .from("homepage_section_items")
        .update(payload)
        .eq("id", form.id));
    } else {
      ({ error } = await supabase.from("homepage_section_items").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Öğe güncellendi." : "Öğe eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("homepage_section_items")
      .delete()
      .eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Öğe silindi.");
      fetchData();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((i, idx) => ({
      ...i,
      order: idx,
    }));
    setItems(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((i, idx) =>
        supabase.from("homepage_section_items").update({ order: idx }).eq("id", i.id)
      )
    );
    toast.success("Sıralama kaydedildi.");
  };

  if (loading) {
    return (
      <>
        <AdminHeader title="Bölüm Öğeleri" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  if (section && section.source !== "custom") {
    return (
      <>
        <AdminHeader title={section.title} />
        <div className="p-4 lg:p-6 max-w-3xl">
          <Link
            href="/admin/anasayfa-bolumleri"
            className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-4"
          >
            <ArrowLeft className="h-4 w-4" />
            Bölümlere Dön
          </Link>
          <div className="rounded-xl bg-white border border-border p-6 text-center">
            <p className="text-text-muted">
              Bu bölüm <strong>{section.source === "news" ? "Haberler" : "Duyurular"}</strong>{" "}
              kaynağından otomatik beslendiği için öğeleri elle yönetilmez.
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title={section ? `${section.title} — Öğeler` : "Bölüm Öğeleri"} />
      <div className="p-4 lg:p-6 max-w-4xl">
        <Link
          href="/admin/anasayfa-bolumleri"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Bölümlere Dön
        </Link>

        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">
              Bu bölümde gösterilecek öğeleri ekleyin ve sıralayın.
            </p>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4" />
              Öğe Ekle
            </Button>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Henüz öğe eklenmemiş"
              description="Bu bölümde gösterilecek ilk öğeyi ekleyin."
              actionLabel="Öğe Ekle"
              onAction={handleNew}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableItemRow
                    key={item.id}
                    item={item}
                    onEdit={handleEdit}
                    onDelete={setDeleteItem}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Öğe Düzenle" : "Yeni Öğe"}
        className="max-w-xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <Input
            id="item-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Öğe başlığı"
            required
          />

          <div>
            <label className="block text-sm font-medium text-text-dark mb-1">
              Açıklama (opsiyonel)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              placeholder="Kısa açıklama (2 satır)"
              className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
            />
          </div>

          <FormField label="Görsel (opsiyonel)">
            <ImageUploader
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
              folder="homepage-sections"
              maxWidth={1200}
              maxHeight={800}
            />
          </FormField>

          <Input
            id="item-link"
            label="Link URL"
            value={form.link_url}
            onChange={(e) => setForm({ ...form, link_url: e.target.value })}
            placeholder="/sayfa/ornek veya https://..."
          />

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="item-order"
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
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              İptal
            </Button>
            <Button onClick={handleSave} loading={saving}>
              Kaydet
            </Button>
          </div>
        </div>
      </Modal>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.title}" öğesini silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
