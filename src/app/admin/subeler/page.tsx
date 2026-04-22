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
import { Plus, Building2, GripVertical, Edit, Trash2, Phone, Mail, MapPin, Info, User } from "lucide-react";
import { Branch, BoardMember } from "@/types";
import { createSlug } from "@/lib/utils";
import ImageUploader from "@/components/admin/ImageUploader";
import RichTextEditor from "@/components/admin/RichTextEditor";
import FormField from "@/components/admin/FormField";
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

interface BranchFormData {
  id?: string;
  name: string;
  slug: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  map_url: string;
  working_hours: string;
  description: string;
  manager_id: string | null;
  manager_name: string;
  manager_title: string;
  manager_photo: string;
  manager_bio: string;
  manager_phone: string;
  manager_email: string;
  is_active: boolean;
}

const emptyForm: BranchFormData = {
  name: "",
  slug: "",
  city: "",
  address: "",
  phone: "",
  email: "",
  map_url: "",
  working_hours: "",
  description: "",
  manager_id: null,
  manager_name: "",
  manager_title: "",
  manager_photo: "",
  manager_bio: "",
  manager_phone: "",
  manager_email: "",
  is_active: true,
};

type ManagerMode = "board" | "manual" | "none";

function SortableBranchRow({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: Branch;
  onEdit: (item: Branch) => void;
  onDelete: (item: Branch) => void;
  onToggle: (item: Branch) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-white p-4 flex items-center gap-3">
      <button {...attributes} {...listeners} className="text-text-muted hover:text-text-dark cursor-grab touch-none">
        <GripVertical className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-dark truncate">{item.name}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-text-muted mt-1">
          {item.city && (
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.city}</span>
          )}
          {item.phone && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{item.phone}</span>
          )}
          {item.email && (
            <span className="flex items-center gap-1 truncate"><Mail className="h-3 w-3 shrink-0" />{item.email}</span>
          )}
        </div>
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

export default function AdminBranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [boardMembers, setBoardMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<BranchFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<Branch | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState<"info" | "manager">("info");
  const [managerMode, setManagerMode] = useState<ManagerMode>("none");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchBranches = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("branches").select("*").order("order", { ascending: true });
    setBranches(data || []);
    setLoading(false);
  }, []);

  const fetchBoardMembers = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("board_members")
      .select("*")
      .eq("is_active", true)
      .order("order", { ascending: true });
    setBoardMembers(data || []);
  }, []);

  useEffect(() => {
    fetchBranches();
    fetchBoardMembers();
  }, [fetchBranches, fetchBoardMembers]);

  const openNew = () => {
    setForm(emptyForm);
    setActiveTab("info");
    setManagerMode("none");
    setModalOpen(true);
  };

  const handleEdit = (item: Branch) => {
    setForm({
      id: item.id,
      name: item.name,
      slug: item.slug || "",
      city: item.city || "",
      address: item.address || "",
      phone: item.phone || "",
      email: item.email || "",
      map_url: item.map_url || "",
      working_hours: item.working_hours || "",
      description: item.description || "",
      manager_id: item.manager_id || null,
      manager_name: item.manager_name || "",
      manager_title: item.manager_title || "",
      manager_photo: item.manager_photo || "",
      manager_bio: item.manager_bio || "",
      manager_phone: item.manager_phone || "",
      manager_email: item.manager_email || "",
      is_active: item.is_active,
    });
    if (item.manager_id) {
      setManagerMode("board");
    } else if (item.manager_name) {
      setManagerMode("manual");
    } else {
      setManagerMode("none");
    }
    setActiveTab("info");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Şube adı zorunludur.");
      return;
    }

    const finalSlug = form.slug.trim() || createSlug(form.name);

    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      slug: finalSlug || null,
      city: form.city.trim() || null,
      address: form.address.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      map_url: form.map_url.trim() || null,
      working_hours: form.working_hours.trim() || null,
      description: form.description || null,
      is_active: form.is_active,
    };

    if (managerMode === "board" && form.manager_id) {
      payload.manager_id = form.manager_id;
      payload.manager_name = null;
      payload.manager_title = null;
      payload.manager_photo = null;
      payload.manager_bio = null;
      payload.manager_phone = null;
      payload.manager_email = null;
    } else if (managerMode === "manual") {
      payload.manager_id = null;
      payload.manager_name = form.manager_name.trim() || null;
      payload.manager_title = form.manager_title.trim() || null;
      payload.manager_photo = form.manager_photo || null;
      payload.manager_bio = form.manager_bio || null;
      payload.manager_phone = form.manager_phone.trim() || null;
      payload.manager_email = form.manager_email.trim() || null;
    } else {
      payload.manager_id = null;
      payload.manager_name = null;
      payload.manager_title = null;
      payload.manager_photo = null;
      payload.manager_bio = null;
      payload.manager_phone = null;
      payload.manager_email = null;
    }

    let error;
    if (form.id) {
      ({ error } = await supabase.from("branches").update(payload).eq("id", form.id));
    } else {
      payload.order = branches.length;
      ({ error } = await supabase.from("branches").insert(payload));
    }

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme başarısız oldu.");
      }
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

  const handleToggle = async (item: Branch) => {
    const supabase = createClient();
    const { error } = await supabase.from("branches").update({ is_active: !item.is_active }).eq("id", item.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setBranches((prev) => prev.map((b) => (b.id === item.id ? { ...b, is_active: !b.is_active } : b)));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = branches.findIndex((i) => i.id === active.id);
    const newIndex = branches.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(branches, oldIndex, newIndex);
    setBranches(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((i, idx) =>
        supabase.from("branches").update({ order: idx }).eq("id", i.id)
      )
    );
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Şubeler" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Yeni Şube Ekle
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : branches.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Henüz şube eklenmemiş"
              description="Şubeleri eklemek için başlayın."
              actionLabel="Yeni Şube Ekle"
              onAction={openNew}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={branches.map((b) => b.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {branches.map((item) => (
                    <SortableBranchRow
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
        title={form.id ? "Şube Düzenle" : "Yeni Şube Ekle"}
        className="max-w-2xl"
      >
        {/* Tabs */}
        <div className="flex gap-1 border-b border-border mb-4 -mx-1 px-1">
          <button
            type="button"
            onClick={() => setActiveTab("info")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "info"
                ? "text-primary border-primary"
                : "text-text-muted border-transparent hover:text-text-dark"
            )}
          >
            <Info className="h-4 w-4" />
            Şube Bilgileri
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("manager")}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === "manager"
                ? "text-primary border-primary"
                : "text-text-muted border-transparent hover:text-text-dark"
            )}
          >
            <User className="h-4 w-4" />
            Yönetici
          </button>
        </div>

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {activeTab === "info" && (
            <>
              <Input
                id="branch-name"
                label="Şube Adı"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ankara 1 No'lu Şube"
                required
              />
              <Input
                id="branch-slug"
                label="URL Kısa Adı"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                placeholder="ankara-merkez-subesi"
                helperText="Şube adından otomatik oluşur. Şubenin adresi: /subeler/bu-ad"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <Input
                id="branch-working-hours"
                label="Çalışma Saatleri"
                value={form.working_hours}
                onChange={(e) => setForm({ ...form, working_hours: e.target.value })}
                placeholder="Pazartesi - Cuma, 09:00 - 17:00"
              />
              <div>
                <label className="block text-sm font-medium text-text-dark mb-1">
                  Google Maps Embed URL (opsiyonel)
                </label>
                <textarea
                  value={form.map_url}
                  onChange={(e) => setForm({ ...form, map_url: e.target.value })}
                  rows={2}
                  placeholder="https://www.google.com/maps/embed?pb=..."
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none font-mono"
                />
                <p className="text-xs text-text-muted mt-1">
                  Google Maps'te konumu aç → Paylaş → Haritayı yerleştir → src=&quot;...&quot; içindeki URL'yi kopyala. Boş bırakılırsa adresten otomatik harita oluşturulur.
                </p>
              </div>
              <FormField label="Şube Hakkında (opsiyonel)">
                <RichTextEditor
                  content={form.description}
                  onChange={(html) => setForm({ ...form, description: html })}
                />
              </FormField>
            </>
          )}

          {activeTab === "manager" && (
            <>
              <div>
                <label className="block text-sm font-medium text-text-dark mb-2">Yönetici Kaynağı</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setManagerMode("none")}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left transition-all text-sm",
                      managerMode === "none"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-text-muted hover:border-primary/30"
                    )}
                  >
                    <div className="font-medium">Yok</div>
                    <p className="text-xs text-text-muted mt-0.5">Yönetici gösterilmesin</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagerMode("board")}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left transition-all text-sm",
                      managerMode === "board"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-text-muted hover:border-primary/30"
                    )}
                  >
                    <div className="font-medium">Yönetim Kurulundan</div>
                    <p className="text-xs text-text-muted mt-0.5">Mevcut üye seç</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagerMode("manual")}
                    className={cn(
                      "rounded-lg border-2 p-3 text-left transition-all text-sm",
                      managerMode === "manual"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border text-text-muted hover:border-primary/30"
                    )}
                  >
                    <div className="font-medium">Manuel Gir</div>
                    <p className="text-xs text-text-muted mt-0.5">Şubeye özel yönetici</p>
                  </button>
                </div>
              </div>

              {managerMode === "board" && (
                <div>
                  <label className="block text-sm font-medium text-text-dark mb-1">Yönetim Kurulu Üyesi</label>
                  {boardMembers.length === 0 ? (
                    <p className="text-sm text-text-muted rounded-lg border border-dashed border-border p-4 text-center">
                      Önce Yönetim Kurulu sayfasından üye eklemelisiniz.
                    </p>
                  ) : (
                    <select
                      value={form.manager_id || ""}
                      onChange={(e) => setForm({ ...form, manager_id: e.target.value || null })}
                      className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">Üye seçin...</option>
                      {boardMembers.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}{m.title ? ` — ${m.title}` : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {managerMode === "manual" && (
                <>
                  <Input
                    id="manager-name"
                    label="Ad Soyad"
                    value={form.manager_name}
                    onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                    placeholder="Ahmet Yılmaz"
                  />
                  <Input
                    id="manager-title"
                    label="Unvan"
                    value={form.manager_title}
                    onChange={(e) => setForm({ ...form, manager_title: e.target.value })}
                    placeholder="Şube Başkanı"
                  />
                  <FormField label="Fotoğraf">
                    <ImageUploader
                      value={form.manager_photo}
                      onChange={(url) => setForm({ ...form, manager_photo: url })}
                      folder="branch-managers"
                      maxWidth={400}
                      maxHeight={500}
                    />
                  </FormField>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      id="manager-phone"
                      label="Telefon (opsiyonel)"
                      value={form.manager_phone}
                      onChange={(e) => setForm({ ...form, manager_phone: e.target.value })}
                      placeholder="+90 (532) 000 00 00"
                    />
                    <Input
                      id="manager-email"
                      label="E-posta (opsiyonel)"
                      type="email"
                      value={form.manager_email}
                      onChange={(e) => setForm({ ...form, manager_email: e.target.value })}
                      placeholder="yonetici@sendika.tr"
                    />
                  </div>
                  <FormField label="Hakkında">
                    <RichTextEditor
                      content={form.manager_bio}
                      onChange={(html) => setForm({ ...form, manager_bio: html })}
                    />
                  </FormField>
                </>
              )}

              {managerMode === "none" && (
                <p className="text-sm text-text-muted rounded-lg border border-dashed border-border p-4 text-center">
                  Bu şube için yönetici bilgisi gösterilmeyecek.
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-border mt-4">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>Kaydet</Button>
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
