"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import ImageUploader from "@/components/admin/ImageUploader";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import FormField from "@/components/admin/FormField";
import { Plus, Edit, Trash2, GripVertical, Images } from "lucide-react";
import { Slider } from "@/types";
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
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";

interface SliderFormData {
  id?: string;
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  order: number;
  is_active: boolean;
}

const emptyForm: SliderFormData = {
  title: "",
  subtitle: "",
  image_url: "",
  link_url: "",
  order: 0,
  is_active: true,
};

function SortableSliderCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: Slider;
  onEdit: (item: Slider) => void;
  onDelete: (item: Slider) => void;
  onToggle: (item: Slider) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="relative h-40">
        <img src={item.image_url} alt={item.title || "Slider"} className="w-full h-full object-cover" />
        <div className="absolute top-2 left-2">
          <button {...attributes} {...listeners} className="rounded-lg bg-black/50 p-1.5 text-white cursor-grab">
            <GripVertical className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-text-dark truncate">{item.title || "Başlıksız"}</p>
        {item.subtitle && <p className="text-xs text-text-muted truncate mt-0.5">{item.subtitle}</p>}
        <div className="flex items-center justify-between mt-3">
          <button
            onClick={() => onToggle(item)}
            className={cn(
              "text-xs px-2.5 py-1 rounded-full font-medium transition-colors",
              item.is_active ? "bg-success/10 text-success hover:bg-success/20" : "bg-warning/10 text-warning hover:bg-warning/20"
            )}
          >
            {item.is_active ? "Aktif" : "Pasif"}
          </button>
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(item)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10">
              <Edit className="h-4 w-4" />
            </button>
            <button onClick={() => onDelete(item)} className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminSliderPage() {
  const [sliders, setSliders] = useState<Slider[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SliderFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Slider | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchSliders = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("sliders").select("*").order("order", { ascending: true });
    setSliders(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSliders();
  }, [fetchSliders]);

  const handleEdit = (item: Slider) => {
    setForm({
      id: item.id,
      title: item.title || "",
      subtitle: item.subtitle || "",
      image_url: item.image_url,
      link_url: item.link_url || "",
      order: item.order,
      is_active: item.is_active,
    });
    setModalOpen(true);
  };

  const handleToggle = async (item: Slider) => {
    const supabase = createClient();
    const { error } = await supabase.from("sliders").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setSliders((prev) => prev.map((s) => (s.id === item.id ? { ...s, is_active: !s.is_active } : s)));
    }
  };

  const handleSave = async () => {
    if (!form.image_url) {
      toast.error("Görsel yüklemek zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      title: form.title.trim() || null,
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url,
      link_url: form.link_url.trim() || null,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("sliders").update(payload).eq("id", form.id));
    } else {
      payload.order = sliders.length;
      ({ error } = await supabase.from("sliders").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Slide güncellendi." : "Slide eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchSliders();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("sliders").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Slide silindi.");
      fetchSliders();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sliders.findIndex((i) => i.id === active.id);
    const newIndex = sliders.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(sliders, oldIndex, newIndex);
    setSliders(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((item, idx) => supabase.from("sliders").update({ order: idx }).eq("id", item.id))
    );
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Slider Yönetimi" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">Slide&apos;ları sürükleyerek sıralayabilirsiniz.</p>
            <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
              <Plus className="h-4 w-4" />
              Yeni Slide Ekle
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : sliders.length === 0 ? (
            <EmptyState
              icon={Images}
              title="Henüz slide eklenmemiş"
              description="Slider'a görsel eklemek için 'Yeni Slide Ekle' butonuna tıklayın."
              actionLabel="Yeni Slide Ekle"
              onAction={() => { setForm(emptyForm); setModalOpen(true); }}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={sliders.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {sliders.map((item) => (
                    <SortableSliderCard
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

      {/* Add/Edit Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Slide Düzenle" : "Yeni Slide Ekle"}>
        <div className="space-y-4">
          <FormField label="Görsel" required>
            <ImageUploader value={form.image_url} onChange={(url) => setForm({ ...form, image_url: url })} folder="sliders" maxWidth={1200} maxHeight={600} />
          </FormField>
          <Input
            id="slider-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Slide başlığı (opsiyonel)"
          />
          <Input
            id="slider-subtitle"
            label="Alt Başlık"
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            placeholder="Alt başlık (opsiyonel)"
          />
          <Input
            id="slider-link"
            label="Link URL"
            value={form.link_url}
            onChange={(e) => setForm({ ...form, link_url: e.target.value })}
            placeholder="https://... (opsiyonel)"
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
          <p className="text-xs text-text-muted">
            Sıralama liste sayfasında sürükle-bırak ile yapılır.
          </p>
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
        description={`"${deleteItem?.title || "Başlıksız"}" slide'ı silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
