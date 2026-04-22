// Supabase SQL Editor'de çalıştırın (kolonlar yoksa ekler):
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS content TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS slug TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS video_url TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS youtube_url TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS image_url TEXT;

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
import ImageUploader from "@/components/admin/ImageUploader";
import MediaUploader from "@/components/admin/MediaUploader";
import RichTextEditor from "@/components/admin/RichTextEditor";
import FormField from "@/components/admin/FormField";
import { Plus, Zap, GripVertical, Edit, Trash2 } from "lucide-react";
import { QuickAccess } from "@/types";
import { createSlug } from "@/lib/utils";
import toast from "react-hot-toast";
import * as LucideIcons from "lucide-react";
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

interface QuickAccessFormData {
  id?: string;
  title: string;
  icon: string;
  image_url: string;
  url: string;
  slug: string;
  content: string;
  video_url: string;
  youtube_url: string;
  order: number;
  is_active: boolean;
}

const emptyForm: QuickAccessFormData = {
  title: "",
  icon: "",
  image_url: "",
  url: "",
  slug: "",
  content: "",
  video_url: "",
  youtube_url: "",
  order: 0,
  is_active: true,
};

const iconSuggestions = [
  "FileText", "Phone", "Mail", "MapPin", "Calendar", "Users",
  "Briefcase", "BookOpen", "Shield", "Scale", "Gavel", "Heart",
  "Award", "ClipboardList", "Download", "ExternalLink",
];

function getIconComponent(iconName: string) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || null;
}

function SortableQuickAccessCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: QuickAccess;
  onEdit: (item: QuickAccess) => void;
  onDelete: (item: QuickAccess) => void;
  onToggle: (item: QuickAccess) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const Icon = item.icon ? getIconComponent(item.icon) : null;

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-white p-4 flex items-center gap-3">
      <button {...attributes} {...listeners} className="text-text-muted hover:text-text-dark cursor-grab touch-none">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="w-12 h-12 flex items-center justify-center shrink-0 rounded-lg bg-primary/5">
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_url} alt={item.title} className="w-full h-full object-cover rounded-lg" />
        ) : Icon ? (
          <Icon className="h-6 w-6 text-primary" />
        ) : (
          <Zap className="h-5 w-5 text-text-muted" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-dark truncate">{item.title}</p>
        {item.slug && <p className="text-xs text-text-muted truncate">/{item.slug}</p>}
      </div>
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
  );
}

export default function AdminQuickAccessPage() {
  const [items, setItems] = useState<QuickAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<QuickAccessFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<QuickAccess | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("quick_access").select("*").order("order", { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!slugManuallyEdited && form.title && !form.id) {
      setForm((prev) => ({ ...prev, slug: createSlug(prev.title) }));
    }
  }, [form.title, form.id, slugManuallyEdited]);

  const openNew = () => {
    setForm(emptyForm);
    setSlugManuallyEdited(false);
    setModalOpen(true);
  };

  const handleEdit = (item: QuickAccess) => {
    setForm({
      id: item.id,
      title: item.title,
      icon: item.icon || "",
      image_url: item.image_url || "",
      url: item.url || "",
      slug: item.slug || "",
      content: item.content || "",
      video_url: item.video_url || "",
      youtube_url: item.youtube_url || "",
      order: item.order,
      is_active: item.is_active,
    });
    setSlugManuallyEdited(true);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur.");
      return;
    }

    const finalSlug = form.slug.trim() || createSlug(form.title);
    if (!finalSlug) {
      toast.error("Slug oluşturulamadı. Başlığı kontrol edin.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      icon: form.icon.trim() || null,
      image_url: form.image_url.trim() || null,
      url: form.url.trim() || `/hizli-erisim/${finalSlug}`,
      slug: finalSlug,
      content: form.content || null,
      video_url: form.video_url.trim() || null,
      youtube_url: form.youtube_url.trim() || null,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("quick_access").update(payload).eq("id", form.id));
    } else {
      payload.order = items.length;
      ({ error } = await supabase.from("quick_access").insert(payload));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme başarısız oldu.");
      }
    } else {
      toast.success(form.id ? "Buton güncellendi." : "Buton eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      setSlugManuallyEdited(false);
      fetchItems();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("quick_access").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Buton silindi.");
      fetchItems();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleToggle = async (item: QuickAccess) => {
    const supabase = createClient();
    const { error } = await supabase.from("quick_access").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, is_active: !i.is_active } : i)));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((i, idx) =>
        supabase.from("quick_access").update({ order: idx }).eq("id", i.id)
      )
    );
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Hızlı Erişim Butonları" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">Anasayfadaki hızlı erişim butonlarını yönetin.</p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Yeni Buton Ekle
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="Henüz hızlı erişim butonu yok"
              description="Anasayfada görünecek hızlı erişim butonları ekleyin."
              actionLabel="Yeni Buton Ekle"
              onAction={openNew}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="space-y-2">
                  {items.map((item) => (
                    <SortableQuickAccessCard
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
        title={form.id ? "Buton Düzenle" : "Yeni Buton Ekle"}
        className="max-w-2xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <Input
            id="qa-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Toplu Sözleşme"
            required
          />

          <Input
            id="qa-slug"
            label="URL Kısa Adı"
            value={form.slug}
            onChange={(e) => {
              setForm({ ...form, slug: e.target.value });
              setSlugManuallyEdited(true);
            }}
            placeholder="toplu-sozlesme"
            helperText="Başlıktan otomatik oluşur. Adresi: /hizli-erisim/bu-ad"
          />

          <FormField label="Kapak Görseli (opsiyonel)">
            <ImageUploader
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
              folder="quick-access"
              maxWidth={800}
              maxHeight={500}
            />
            <p className="text-xs text-text-muted mt-1.5">
              Görsel yüklenirse ikon yerine görsel gösterilir. Görsel yoksa ikon kullanılır.
            </p>
          </FormField>

          <FormField label="İçerik">
            <RichTextEditor
              content={form.content}
              onChange={(html) => setForm({ ...form, content: html })}
            />
          </FormField>

          <FormField label="Video (opsiyonel)">
            <MediaUploader
              value={form.video_url}
              onChange={(url) => setForm({ ...form, video_url: url })}
              youtubeUrl={form.youtube_url}
              onYoutubeChange={(url) => setForm({ ...form, youtube_url: url })}
              folder="quick-access/videos"
            />
          </FormField>

          <div>
            <Input
              id="qa-icon"
              label="Lucide İkon Adı"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="FileText"
              helperText="Görsel yoksa kullanılır (ör: FileText, Phone, Mail)"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {iconSuggestions.map((name) => {
                const Icon = getIconComponent(name);
                if (!Icon) return null;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm({ ...form, icon: name })}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${form.icon === name ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:border-primary/50"}`}
                    title={name}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

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
        description={`"${deleteItem?.title}" butonunu silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
