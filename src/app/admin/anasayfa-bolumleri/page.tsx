// Supabase SQL Editor'de çalıştırın:
//
// CREATE TABLE IF NOT EXISTS homepage_sections (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   title TEXT NOT NULL,
//   section_type TEXT NOT NULL DEFAULT 'custom',
//   source TEXT DEFAULT 'custom',
//   item_count INTEGER DEFAULT 4,
//   layout TEXT DEFAULT 'grid-4',
//   "order" INTEGER DEFAULT 0,
//   is_active BOOLEAN DEFAULT true,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
//
// CREATE TABLE IF NOT EXISTS homepage_section_items (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   section_id UUID REFERENCES homepage_sections(id) ON DELETE CASCADE,
//   title TEXT NOT NULL,
//   description TEXT,
//   image_url TEXT,
//   link_url TEXT,
//   "order" INTEGER DEFAULT 0,
//   is_active BOOLEAN DEFAULT true,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
//
// ALTER TABLE homepage_sections ENABLE ROW LEVEL SECURITY;
// ALTER TABLE homepage_section_items ENABLE ROW LEVEL SECURITY;
//
// CREATE POLICY "Public read active sections" ON homepage_sections FOR SELECT USING (is_active = true);
// CREATE POLICY "Auth full access sections" ON homepage_sections FOR ALL USING (auth.role() = 'authenticated');
// CREATE POLICY "Public read active section items" ON homepage_section_items FOR SELECT USING (is_active = true);
// CREATE POLICY "Auth full access section items" ON homepage_section_items FOR ALL USING (auth.role() = 'authenticated');

"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, GripVertical, Edit, Trash2, LayoutGrid, ListOrdered } from "lucide-react";
import { HomepageSection } from "@/types";
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

interface SectionFormData {
  id?: string;
  title: string;
  source: "custom" | "news" | "announcements";
  item_count: number;
  layout: "grid-4" | "grid-8";
  order: number;
  is_active: boolean;
}

const emptyForm: SectionFormData = {
  title: "",
  source: "custom",
  item_count: 4,
  layout: "grid-4",
  order: 0,
  is_active: true,
};

const sourceLabels: Record<SectionFormData["source"], string> = {
  custom: "Özel (öğeleri elle ekle)",
  news: "Haberler (otomatik)",
  announcements: "Duyurular (otomatik)",
};

function SortableSectionCard({
  section,
  itemCounts,
  onEdit,
  onDelete,
  onManageItems,
  onToggleActive,
}: {
  section: HomepageSection;
  itemCounts: Record<string, number>;
  onEdit: (section: HomepageSection) => void;
  onDelete: (section: HomepageSection) => void;
  onManageItems: (section: HomepageSection) => void;
  onToggleActive: (section: HomepageSection) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const customCount = section.source === "custom" ? itemCounts[section.id] ?? 0 : section.item_count;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-border bg-white px-4 py-3 mb-2"
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-text-muted hover:text-text-dark"
        aria-label="Sırala"
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-text-dark">{section.title}</span>
          <span className="text-xs text-text-muted">• {sourceLabels[section.source]}</span>
          <span className="text-xs text-text-muted">• {section.layout}</span>
          <span className="text-xs text-text-muted">• {customCount} öğe</span>
        </div>
      </div>

      <button
        onClick={() => onToggleActive(section)}
        className={cn(
          "text-xs px-2.5 py-0.5 rounded-full font-medium transition-colors",
          section.is_active
            ? "bg-success/10 text-success hover:bg-success/20"
            : "bg-warning/10 text-warning hover:bg-warning/20"
        )}
        title={section.is_active ? "Pasife al" : "Aktife al"}
      >
        {section.is_active ? "Aktif" : "Pasif"}
      </button>

      {section.source === "custom" && (
        <button
          onClick={() => onManageItems(section)}
          className="flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-muted hover:text-primary hover:border-primary/40 transition-colors"
          title="Öğeleri yönet"
        >
          <ListOrdered className="h-3.5 w-3.5" />
          Öğeler
        </button>
      )}

      <button
        onClick={() => onEdit(section)}
        className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10"
        title="Düzenle"
      >
        <Edit className="h-4 w-4" />
      </button>
      <button
        onClick={() => onDelete(section)}
        className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
        title="Sil"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function AdminHomepageSectionsPage() {
  const router = useRouter();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [itemCounts, setItemCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<SectionFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<HomepageSection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchSections = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("homepage_sections")
      .select("*")
      .order("order", { ascending: true });
    const list = (data as HomepageSection[]) || [];
    setSections(list);

    const customIds = list.filter((s) => s.source === "custom").map((s) => s.id);
    if (customIds.length > 0) {
      const { data: items } = await supabase
        .from("homepage_section_items")
        .select("section_id")
        .in("section_id", customIds);
      const counts: Record<string, number> = {};
      (items || []).forEach((it: { section_id: string }) => {
        counts[it.section_id] = (counts[it.section_id] || 0) + 1;
      });
      setItemCounts(counts);
    } else {
      setItemCounts({});
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchSections();
  }, [fetchSections]);

  const handleNew = () => {
    setForm({ ...emptyForm, order: sections.length });
    setModalOpen(true);
  };

  const handleEdit = (section: HomepageSection) => {
    setForm({
      id: section.id,
      title: section.title,
      source: section.source,
      item_count: section.item_count,
      layout: section.layout,
      order: section.order,
      is_active: section.is_active,
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
      section_type: "custom",
      source: form.source,
      item_count: form.item_count,
      layout: form.layout,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("homepage_sections").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("homepage_sections").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Bölüm güncellendi." : "Bölüm eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchSections();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("homepage_sections").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Bölüm silindi.");
      fetchSections();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleToggleActive = async (section: HomepageSection) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("homepage_sections")
      .update({ is_active: !section.is_active })
      .eq("id", section.id);
    if (error) {
      toast.error("Durum değiştirilemedi.");
      return;
    }
    setSections((prev) =>
      prev.map((s) => (s.id === section.id ? { ...s, is_active: !s.is_active } : s))
    );
  };

  const handleManageItems = (section: HomepageSection) => {
    router.push(`/admin/anasayfa-bolumleri/${section.id}`);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sections, oldIndex, newIndex).map((s, idx) => ({
      ...s,
      order: idx,
    }));
    setSections(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((s, idx) =>
        supabase.from("homepage_sections").update({ order: idx }).eq("id", s.id)
      )
    );
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Anasayfa Bölümleri" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">
              Anasayfada gösterilecek dinamik bölümleri yönetin. Haber/duyuru bölümleri
              otomatik beslenir, özel bölümlere istediğiniz öğeleri ekleyebilirsiniz.
            </p>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4" />
              Yeni Bölüm
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : sections.length === 0 ? (
            <EmptyState
              icon={LayoutGrid}
              title="Henüz bölüm eklenmemiş"
              description="Anasayfaya Köşe Yazıları, Etkinlikler, Basın Bültenleri gibi bölümler ekleyin."
              actionLabel="Yeni Bölüm"
              onAction={handleNew}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext
                items={sections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                {sections.map((section) => (
                  <SortableSectionCard
                    key={section.id}
                    section={section}
                    itemCounts={itemCounts}
                    onEdit={handleEdit}
                    onDelete={setDeleteItem}
                    onManageItems={handleManageItems}
                    onToggleActive={handleToggleActive}
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
        title={form.id ? "Bölüm Düzenle" : "Yeni Bölüm"}
      >
        <div className="space-y-4">
          <Input
            id="section-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Köşe Yazıları, Etkinlikler..."
            required
          />

          <Select
            label="Kaynak"
            value={form.source}
            onChange={(e) =>
              setForm({ ...form, source: e.target.value as SectionFormData["source"] })
            }
          >
            <option value="custom">Özel — öğeleri elle ekliyorum</option>
            <option value="news">Haberler — son haberleri otomatik çek</option>
            <option value="announcements">Duyurular — son duyuruları otomatik çek</option>
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Öğe Sayısı"
              value={String(form.item_count)}
              onChange={(e) => setForm({ ...form, item_count: parseInt(e.target.value) })}
            >
              <option value="4">4</option>
              <option value="8">8</option>
            </Select>
            <Select
              label="Düzen"
              value={form.layout}
              onChange={(e) =>
                setForm({ ...form, layout: e.target.value as SectionFormData["layout"] })
              }
            >
              <option value="grid-4">{`4'lü grid (1 satır)`}</option>
              <option value="grid-8">{`4x2 grid (2 satır)`}</option>
            </Select>
          </div>

          <Select
            label="Durum"
            value={form.is_active ? "true" : "false"}
            onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}
          >
            <option value="true">Aktif</option>
            <option value="false">Pasif</option>
          </Select>

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
        description={`"${deleteItem?.title}" bölümünü silmek istediğinize emin misiniz? Bağlı tüm öğeler de silinecektir.`}
      />
    </>
  );
}
