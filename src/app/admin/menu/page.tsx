"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import DeleteModal from "@/components/admin/DeleteModal";
import FormField from "@/components/admin/FormField";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import { Plus, GripVertical, Edit, Trash2, Menu as MenuIcon, FileText, FilePlus } from "lucide-react";
import { MenuItem } from "@/types";
import { createSlug } from "@/lib/utils";
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

function buildTree(items: MenuItem[]): MenuItem[] {
  const map = new Map<string, MenuItem>();
  const roots: MenuItem[] = [];
  items.forEach((i) => map.set(i.id, { ...i, children: [] }));
  map.forEach((i) => {
    if (i.parent_id && map.has(i.parent_id)) {
      map.get(i.parent_id)!.children!.push(i);
    } else {
      roots.push(i);
    }
  });
  const sort = (arr: MenuItem[]) => {
    arr.sort((a, b) => a.order - b.order);
    arr.forEach((x) => x.children && sort(x.children));
  };
  sort(roots);
  return roots;
}

function collectDescendantIds(items: MenuItem[], rootId: string): Set<string> {
  const result = new Set<string>([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const current = queue.shift()!;
    items
      .filter((i) => i.parent_id === current)
      .forEach((child) => {
        if (!result.has(child.id)) {
          result.add(child.id);
          queue.push(child.id);
        }
      });
  }
  return result;
}

function SortableRow({
  item,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  item: MenuItem;
  depth: number;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onAddChild: (parent: MenuItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });
  const children = item.children || [];

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2.5 mb-1.5">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-text-muted hover:text-text-dark"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-text-dark">{item.title}</span>
          {item.url && <span className="ml-2 text-xs text-text-muted">{item.url}</span>}
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
          onClick={() => onAddChild(item)}
          title="Alt menü ekle"
          className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          onClick={() => onEdit(item)}
          className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10"
        >
          <Edit className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(item)}
          className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {children.length > 0 && (
        <div className="ml-8 border-l-2 border-border pl-2">
          <SortableBranch
            items={children}
            depth={depth + 1}
            onEdit={onEdit}
            onDelete={onDelete}
            onAddChild={onAddChild}
          />
        </div>
      )}
    </div>
  );
}

function SortableBranch({
  items,
  depth,
  onEdit,
  onDelete,
  onAddChild,
}: {
  items: MenuItem[];
  depth: number;
  onEdit: (item: MenuItem) => void;
  onDelete: (item: MenuItem) => void;
  onAddChild: (parent: MenuItem) => void;
}) {
  return (
    <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
      {items.map((item) => (
        <SortableRow
          key={item.id}
          item={item}
          depth={depth}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </SortableContext>
  );
}

export default function AdminMenuPage() {
  const router = useRouter();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MenuFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<MenuItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [linkedPageId, setLinkedPageId] = useState<string | null>(null);
  const [pageActionLoading, setPageActionLoading] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
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

  useEffect(() => {
    if (!modalOpen) {
      setLinkedPageId(null);
      return;
    }
    const match = form.url.match(/^\/sayfa\/(.+)$/);
    if (!match) {
      setLinkedPageId(null);
      return;
    }
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("pages")
      .select("id")
      .eq("slug", match[1])
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setLinkedPageId(data?.id || null);
      });
    return () => {
      cancelled = true;
    };
  }, [modalOpen, form.url]);

  const tree = useMemo(() => buildTree(items), [items]);

  const forbiddenParentIds = useMemo(() => {
    if (!form.id) return new Set<string>();
    return collectDescendantIds(items, form.id);
  }, [items, form.id]);

  const parentOptions = useMemo(
    () => items.filter((i) => !forbiddenParentIds.has(i.id)).sort((a, b) => a.title.localeCompare(b.title, "tr")),
    [items, forbiddenParentIds]
  );

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

  const handleAddChild = (parent: MenuItem) => {
    const siblingCount = items.filter((i) => i.parent_id === parent.id).length;
    setForm({ ...emptyForm, parent_id: parent.id, order: siblingCount });
    setModalOpen(true);
  };

  const handleNew = () => {
    const siblingCount = items.filter((i) => !i.parent_id).length;
    setForm({ ...emptyForm, order: siblingCount });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      url: form.url.trim() || null,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("menu_items").update(payload).eq("id", form.id));
    } else {
      const siblingCount = items.filter(
        (i) => (i.parent_id || null) === (form.parent_id || null)
      ).length;
      payload.order = siblingCount;
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

  const handlePageAction = async () => {
    if (linkedPageId) {
      router.push(`/admin/sayfalar/${linkedPageId}`);
      return;
    }
    if (!form.title.trim()) {
      toast.error("Önce başlık girin.");
      return;
    }

    setPageActionLoading(true);
    const supabase = createClient();

    const match = form.url.match(/^\/sayfa\/(.+)$/);
    const slug = match ? match[1] : createSlug(form.title);

    if (!slug) {
      toast.error("Başlıktan geçerli bir slug üretilemedi.");
      setPageActionLoading(false);
      return;
    }

    const { data: existing } = await supabase
      .from("pages")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    let pageId = existing?.id || null;

    if (!pageId) {
      const { data: created, error } = await supabase
        .from("pages")
        .insert({ title: form.title.trim(), slug, is_published: false })
        .select("id")
        .single();
      if (error || !created) {
        toast.error("Sayfa oluşturulamadı.");
        setPageActionLoading(false);
        return;
      }
      pageId = created.id;
    }

    const targetUrl = `/sayfa/${slug}`;
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      url: targetUrl,
      parent_id: form.parent_id || null,
      is_active: form.is_active,
    };

    if (!form.id) {
      const siblingCount = items.filter(
        (i) => (i.parent_id || null) === (form.parent_id || null)
      ).length;
      payload.order = siblingCount;
    }

    const { error: menuError } = form.id
      ? await supabase.from("menu_items").update(payload).eq("id", form.id)
      : await supabase.from("menu_items").insert(payload);

    if (menuError) {
      toast.error("Menü kaydedilemedi.");
      setPageActionLoading(false);
      return;
    }

    toast.success("Sayfa hazır. İçeriği düzenleyebilirsiniz.");
    setModalOpen(false);
    setForm(emptyForm);
    router.push(`/admin/sayfalar/${pageId}`);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();

    const descendantIds = Array.from(collectDescendantIds(items, deleteItem.id));
    const { error } = await supabase.from("menu_items").delete().in("id", descendantIds);

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

    const activeItem = items.find((i) => i.id === active.id);
    const overItem = items.find((i) => i.id === over.id);
    if (!activeItem || !overItem) return;
    if (activeItem.parent_id !== overItem.parent_id) return;

    const siblings = items
      .filter((i) => i.parent_id === activeItem.parent_id)
      .sort((a, b) => a.order - b.order);
    const oldIndex = siblings.findIndex((i) => i.id === active.id);
    const newIndex = siblings.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(siblings, oldIndex, newIndex);

    const reorderedMap = new Map(reordered.map((item, idx) => [item.id, idx]));
    setItems((prev) =>
      prev.map((item) =>
        reorderedMap.has(item.id) ? { ...item, order: reorderedMap.get(item.id)! } : item
      )
    );

    const supabase = createClient();
    const updates = reordered.map((item, idx) =>
      supabase.from("menu_items").update({ order: idx }).eq("id", item.id)
    );
    await Promise.all(updates);
    toast.success("Sıralama kaydedildi.");
  };

  const parentLabel = (id: string | null): string => {
    if (!id) return "—";
    const path: string[] = [];
    let cursor = items.find((i) => i.id === id);
    while (cursor) {
      path.unshift(cursor.title);
      cursor = cursor.parent_id ? items.find((i) => i.id === cursor!.parent_id) : undefined;
    }
    return path.join(" › ");
  };

  return (
    <>
      <AdminHeader title="Menü Yönetimi" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">
              Menü öğelerini sürükleyerek sıralayabilir, + ile sınırsız alt menü ekleyebilirsiniz.
            </p>
            <Button onClick={handleNew}>
              <Plus className="h-4 w-4" />
              Yeni Menü Öğesi
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : tree.length === 0 ? (
            <EmptyState
              icon={MenuIcon}
              title="Henüz menü öğesi yok"
              description="Yeni menü öğesi ekleyerek başlayın."
              actionLabel="Yeni Menü Öğesi"
              onAction={handleNew}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableBranch
                items={tree}
                depth={0}
                onEdit={handleEdit}
                onDelete={setDeleteItem}
                onAddChild={handleAddChild}
              />
            </DndContext>
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Menü Öğesi Düzenle" : "Yeni Menü Öğesi"}
        className="max-w-xl"
      >
        <div className="space-y-6 max-h-[70vh] overflow-y-auto -mx-1 px-1">
          {/* Temel Bilgiler */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Temel Bilgiler</p>
            <Input
              id="menu-title"
              label="Başlık"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="Örn: Hakkımızda"
              required
            />
            <Input
              id="menu-url"
              label="Bağlantı Adresi"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="/sayfa-yolu"
              helperText="Boş bırakılırsa üst menü (dropdown başlık) olur."
            />
          </section>

          {/* Konum ve Durum */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Konum ve Durum</p>
            <FormField label="Üst Menü">
              <Select
                value={form.parent_id || ""}
                onChange={(e) => setForm({ ...form, parent_id: e.target.value || null })}
              >
                <option value="">Ana Menü (Üst seviye)</option>
                {parentOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {parentLabel(item.id)}
                  </option>
                ))}
              </Select>
              {form.id && forbiddenParentIds.size > 1 && (
                <p className="mt-1 text-xs text-text-muted">
                  Kendi alt menüleri üst menü olarak seçilemez (döngü önlenir).
                </p>
              )}
            </FormField>
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
                  Aktif (menüde görünür)
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

          {/* Sayfa Bağlantısı */}
          <section className="space-y-3">
            <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Sayfa İçeriği</p>
            <div className="rounded-lg border border-dashed border-border bg-bg-light p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 shrink-0">
                  {linkedPageId ? (
                    <FileText className="h-5 w-5 text-primary" />
                  ) : (
                    <FilePlus className="h-5 w-5 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-dark">
                    {linkedPageId ? "Bu menüye bağlı bir sayfa var" : "Bu menüye sayfa ekle"}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {linkedPageId
                      ? "İçeriği düzenlemek için editöre gidebilirsin."
                      : "Başlıktan otomatik sayfa oluşturulur, bağlantı kurulur ve editör açılır."}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handlePageAction}
                  loading={pageActionLoading}
                >
                  {linkedPageId ? "İçeriği Düzenle" : "Sayfa Oluştur"}
                </Button>
              </div>
            </div>
          </section>
        </div>

        <div className="flex justify-end gap-3 pt-5 mt-5 border-t border-border">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            İptal
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {form.id ? "Değişiklikleri Kaydet" : "Menü Ekle"}
          </Button>
        </div>
      </Modal>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.title}" menü öğesini silmek istediğinize emin misiniz?${
          deleteItem && items.some((i) => i.parent_id === deleteItem.id)
            ? " Tüm alt menü öğeleri de silinecektir."
            : ""
        }`}
      />
    </>
  );
}
