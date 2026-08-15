"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import SafeImage from "@/components/SafeImage";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import AdminHeader from "@/components/admin/AdminHeader";
import ListLoadError from "@/components/admin/ListLoadError";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import FormField from "@/components/admin/FormField";
import ImageUploader from "@/components/admin/ImageUploader";
import { cleanupReplacedFile } from "@/lib/storage";
import { Plus, GripVertical, Edit, Trash2, LayoutGrid } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { HomepageSection, HomepageSectionItem } from "@/types";
import toast from "react-hot-toast";

const iconSuggestions = [
  "FileText", "Phone", "Mail", "MapPin", "Calendar", "Users",
  "Briefcase", "BookOpen", "Shield", "Scale", "Gavel", "Heart",
  "Award", "ClipboardList", "Download", "ExternalLink",
];

function getIconComponent(iconName: string) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || null;
}
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
import { cn, normalizeExternalUrl } from "@/lib/utils";

interface ItemFormData {
  id?: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  icon: string;
  order: number;
  is_active: boolean;
}

const emptyForm: ItemFormData = {
  title: "",
  description: "",
  image_url: "",
  link_url: "",
  icon: "",
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
        className="cursor-grab text-text-muted hover:text-text-dark touch-none"
        aria-label="Sırala"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="w-14 h-10 rounded bg-bg-light overflow-hidden shrink-0 flex items-center justify-center">
        <SafeImage
          src={item.image_url}
          alt={item.title}
          width={56}
          height={40}
          className="w-full h-full object-cover"
          fallback={<LayoutGrid className="h-4 w-4 text-text-muted" />}
        />
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
  const { tenant } = useTenant();
  const sectionId = params.id as string;

  const [section, setSection] = useState<HomepageSection | null>(null);
  const [items, setItems] = useState<HomepageSectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  // Ogeler fetch hatasi "bos liste" olarak GOSTERILMEZ (Tur 3 b1).
  const [loadFailed, setLoadFailed] = useState(false);
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
    if (!tenant) return;
    const supabase = createClient();
    const [sectionRes, itemsRes] = await Promise.all([
      supabase
        .from("homepage_sections")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("id", sectionId)
        .single(),
      supabase
        .from("homepage_section_items")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("section_id", sectionId)
        .order("order", { ascending: true }),
    ]);

    if (sectionRes.error || !sectionRes.data) {
      toast.error("Bölüm bulunamadı.");
      router.push("/admin/anasayfa-bolumleri");
      return;
    }

    setSection(sectionRes.data as HomepageSection);
    if (itemsRes.error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setItems((itemsRes.data as HomepageSectionItem[]) || []);
    setLoading(false);
  }, [sectionId, router, tenant]);

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
      icon: item.icon || "",
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
    if (!tenant) {
      toast.error("Tenant bilgisi yüklenemedi.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      section_id: sectionId,
      title: form.title.trim(),
      description: form.description.trim() || null,
      image_url: form.image_url.trim() || null,
      link_url: normalizeExternalUrl(form.link_url) || null,
      icon: form.icon.trim() || null,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase
        .from("homepage_section_items")
        .update(payload)
        .eq("tenant_id", tenant.id)
        .eq("id", form.id));
    } else {
      payload.tenant_id = tenant.id;
      ({ error } = await supabase.from("homepage_section_items").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      // Replace orphan temizligi: eski gorsel listeden okunur
      if (form.id) {
        const oldImageUrl = items.find((i) => i.id === form.id)?.image_url;
        await cleanupReplacedFile(
          supabase,
          oldImageUrl,
          form.image_url.trim() || null
        );
      }
      toast.success(form.id ? "Öğe güncellendi." : "Öğe eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem || !tenant) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("homepage_section_items")
      .delete()
      .eq("tenant_id", tenant.id)
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
    if (!over || active.id === over.id || !tenant) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((i, idx) => ({
      ...i,
      order: idx,
    }));
    setItems(reordered);

    const supabase = createClient();
    const results = await Promise.all(
      reordered.map((i, idx) =>
        supabase
          .from("homepage_section_items")
          .update({ order: idx })
          .eq("tenant_id", tenant.id)
          .eq("id", i.id)
      )
    );
    // Manset deseni (Tur 3 b1): hatada sunucudaki gercek sirayi geri cek.
    if (results.some((r) => r.error)) {
      toast.error("Sıralama kaydedilemedi.");
      fetchData();
    } else {
      toast.success("Sıralama kaydedildi.");
    }
  };

  const breadcrumbs = [
    { label: "Anasayfa Bölümleri", href: "/admin/anasayfa-bolumleri" },
    { label: section?.title || "Detay" },
  ];

  if (loading) {
    return (
      <>
        <AdminHeader title="Bölüm Öğeleri" breadcrumbs={breadcrumbs} />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  if (section && section.source !== "custom") {
    return (
      <>
        <AdminHeader title={section.title} breadcrumbs={breadcrumbs} />
        <div className="p-4 lg:p-6 max-w-3xl">
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
      <AdminHeader
        title={section ? `${section.title} — Öğeler` : "Bölüm Öğeleri"}
        breadcrumbs={breadcrumbs}
      />
      <div className="p-4 lg:p-6 max-w-4xl">

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

          {loadFailed ? (
            <ListLoadError onRetry={fetchData} />
          ) : items.length === 0 ? (
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
        <div className="space-y-6 max-h-[70vh] overflow-y-auto -mx-1 px-1">
          {/* Temel Bilgiler */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Temel Bilgiler</p>
            <Input
              id="item-title"
              label="Başlık"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Öğe başlığı"
              required
            />
            <FormField label="Açıklama (opsiyonel)">
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                placeholder="Kısa açıklama (1-2 satır)"
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </FormField>
          </section>

          {/* Görsel ve Bağlantı */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Görsel ve Bağlantı</p>
            <FormField label="Görsel (opsiyonel)">
              <ImageUploader
                value={form.image_url}
                onChange={(url) => setForm({ ...form, image_url: url })}
                folder="homepage-sections"
                maxWidth={1200}
                maxHeight={800}
              />
              <p className="text-xs text-text-muted mt-1.5">
                Görsel yüklenirse ikon yerine görsel gösterilir. Görsel yoksa ikon kullanılır.
              </p>
            </FormField>
            <Input
              id="item-icon"
              label="İkon Adı (opsiyonel)"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="FileText"
              helperText="Görsel yoksa kullanılır. Aşağıdan hazır ikonlardan seçebilirsin."
            />
            <div className="flex flex-wrap gap-1.5">
              {iconSuggestions.map((name) => {
                const Icon = getIconComponent(name);
                if (!Icon) return null;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm({ ...form, icon: name })}
                    className={cn(
                      "flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors",
                      form.icon === name
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-text-muted hover:border-primary/50"
                    )}
                    title={name}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {name}
                  </button>
                );
              })}
            </div>
            <Input
              id="item-link"
              label="Bağlantı Adresi"
              value={form.link_url}
              onChange={(e) => setForm({ ...form, link_url: e.target.value })}
              placeholder="/sayfa/ornek veya https://..."
              helperText="Tıklanınca gidilecek adres (opsiyonel)"
            />
          </section>

          {/* Durum */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Durum</p>
            <FormField label="Durum">
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
                  Aktif (görünür)
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
                  Pasif (gizli)
                </button>
              </div>
            </FormField>
          </section>
        </div>

        <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-border">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            İptal
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {form.id ? "Değişiklikleri Kaydet" : "Öğe Ekle"}
          </Button>
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
