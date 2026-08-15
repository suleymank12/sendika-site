"use client";

import { useEffect, useState, useCallback } from "react";
import SafeImage from "@/components/SafeImage";
import { createClient } from "@/lib/supabase/client";
import {
  storagePathFromUrl,
  removeFilesFromStorage,
  cleanupReplacedFile,
} from "@/lib/storage";
import { useTenant } from "@/hooks/useTenant";
import AdminHeader from "@/components/admin/AdminHeader";
import ListLoadError from "@/components/admin/ListLoadError";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import ImageUploader from "@/components/admin/ImageUploader";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import FormField from "@/components/admin/FormField";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { Plus, Edit, Trash2, GripVertical, Users } from "lucide-react";
import { BoardMember } from "@/types";
import { createSlug, cn, isValidEmail } from "@/lib/utils";
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

interface MemberFormData {
  id?: string;
  name: string;
  title: string;
  photo: string;
  slug: string;
  bio: string;
  phone: string;
  email: string;
  is_active: boolean;
}

const emptyForm: MemberFormData = {
  name: "",
  title: "",
  photo: "",
  slug: "",
  bio: "",
  phone: "",
  email: "",
  is_active: true,
};

function SortableMemberCard({
  item,
  onEdit,
  onDelete,
  onToggle,
}: {
  item: BoardMember;
  onEdit: (item: BoardMember) => void;
  onDelete: (item: BoardMember) => void;
  onToggle: (item: BoardMember) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="relative h-48">
        <SafeImage
          src={item.photo}
          alt={`Yönetim kurulu üyesi: ${item.name}`}
          fill
          sizes="(max-width: 640px) 100vw, (max-width: 1280px) 33vw, 25vw"
          className="object-cover"
          fallback={
            <div className="w-full h-48 bg-bg-light flex items-center justify-center">
              <Users className="h-12 w-12 text-text-muted/30" />
            </div>
          }
        />
        <button
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 rounded-lg bg-black/50 p-1.5 text-white cursor-grab touch-none"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {/* Fotograf uzerinde okunabilirlik icin solid arka plan (subeler pill'inin
            bg-success/10 tonu beyaz kart icindi, foto uzerinde okunmazdi) */}
        <button
          onClick={() => onToggle(item)}
          title={item.is_active ? "Pasife al" : "Aktife al"}
          className={cn(
            "absolute top-2 right-2 text-xs px-2.5 py-1 rounded-full font-medium transition-colors shadow-sm",
            item.is_active
              ? "bg-success text-white hover:bg-success/90"
              : "bg-warning text-white hover:bg-warning/90"
          )}
        >
          {item.is_active ? "Aktif" : "Pasif"}
        </button>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-text-dark">{item.name}</p>
        {item.title && <p className="text-xs text-text-muted mt-0.5">{item.title}</p>}
        <div className="flex items-center justify-end mt-3 gap-1">
          <button onClick={() => onEdit(item)} className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10">
            <Edit className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(item)} className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminBoardMembersPage() {
  const { tenant } = useTenant();
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
  // Fetch hatasi "bos liste" olarak GOSTERILMEZ (Tur 3 b1) — ListLoadError.
  const [loadFailed, setLoadFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<MemberFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<BoardMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchMembers = useCallback(async () => {
    if (!tenant) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("board_members")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("order", { ascending: true });
    if (error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setMembers(data || []);
    setLoading(false);
  }, [tenant]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleEdit = (item: BoardMember) => {
    setForm({
      id: item.id,
      name: item.name,
      title: item.title || "",
      photo: item.photo || "",
      slug: item.slug || "",
      bio: item.bio || "",
      phone: item.phone || "",
      email: item.email || "",
      is_active: item.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Ad alanı zorunludur.");
      return;
    }
    if (!tenant) {
      toast.error("Tenant bilgisi yüklenemedi.");
      return;
    }
    if (form.email.trim() && !isValidEmail(form.email)) {
      toast.error("Geçerli bir e-posta adresi girin.");
      return;
    }

    const finalSlug = form.slug.trim() || createSlug(form.name);

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      photo: form.photo || null,
      slug: finalSlug || null,
      bio: form.bio || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase
        .from("board_members")
        .update(payload)
        .eq("tenant_id", tenant.id)
        .eq("id", form.id));
    } else {
      payload.tenant_id = tenant.id;
      payload.order = members.length;
      ({ error } = await supabase.from("board_members").insert(payload));
    }

    if (error) {
      if ((error as { code?: string }).code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme başarısız oldu.");
      }
    } else {
      // Replace orphan temizligi: eski foto listeden okunur (best-effort)
      if (form.id) {
        const oldPhoto = members.find((m) => m.id === form.id)?.photo;
        await cleanupReplacedFile(supabase, oldPhoto, form.photo || null);
      }
      toast.success(form.id ? "Üye güncellendi." : "Üye eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchMembers();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem || !tenant) return;
    setDeleting(true);
    // Storage path'i DB silmeden ONCE yakala
    const imagePath = storagePathFromUrl(deleteItem.photo);

    const supabase = createClient();
    const { error } = await supabase
      .from("board_members")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      // Storage temizligi (best-effort, hata UI'a yansimaz)
      await removeFilesFromStorage(supabase, "images", [imagePath]);
      toast.success("Üye silindi.");
      fetchMembers();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleToggle = async (item: BoardMember) => {
    if (!tenant) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("board_members")
      .update({ is_active: !item.is_active })
      .eq("tenant_id", tenant.id)
      .eq("id", item.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setMembers((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, is_active: !m.is_active } : m))
      );
      // Toggle etkisi aninda — sessiz kalirsa admin emin olamiyor (Tur 3 b1).
      toast.success(item.is_active ? "Pasife alındı — sitede artık görünmez." : "Aktife alındı.");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !tenant) return;
    const oldIndex = members.findIndex((i) => i.id === active.id);
    const newIndex = members.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(members, oldIndex, newIndex);
    setMembers(reordered);

    const supabase = createClient();
    const results = await Promise.all(
      reordered.map((item, idx) =>
        supabase
          .from("board_members")
          .update({ order: idx })
          .eq("tenant_id", tenant.id)
          .eq("id", item.id)
      )
    );
    // Manset deseni (Tur 3 b1): hatada sunucudaki gercek sirayi geri cek.
    if (results.some((r) => r.error)) {
      toast.error("Sıralama kaydedilemedi.");
      fetchMembers();
    } else {
      toast.success("Sıralama kaydedildi.");
    }
  };

  return (
    <>
      <AdminHeader title="Yönetim Kurulu" helpTopic="yonetim-kurulu" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">Üyeleri sürükleyerek sıralayabilirsiniz.</p>
            <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
              <Plus className="h-4 w-4" />
              Yeni Üye Ekle
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : loadFailed ? (
            <ListLoadError onRetry={fetchMembers} />
          ) : members.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Henüz üye eklenmemiş"
              description="Yönetim kurulu üyelerini eklemek için başlayın."
              actionLabel="Yeni Üye Ekle"
              onAction={() => { setForm(emptyForm); setModalOpen(true); }}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={members.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {members.map((item) => (
                    <SortableMemberCard key={item.id} item={item} onEdit={handleEdit} onDelete={setDeleteItem} onToggle={handleToggle} />
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
        title={form.id ? "Üye Düzenle" : "Yeni Üye Ekle"}
        className="max-w-7xl w-[92vw]"
      >
        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10">
            {/* Sol sütun — Bilgiler ve özgeçmiş */}
            <div className="space-y-6 min-w-0">
              {/* Kişisel Bilgiler */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Kişisel Bilgiler</p>
                <Input
                  id="member-name"
                  label="Ad Soyad"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Ad Soyad"
                  required
                />
                <Input
                  id="member-title"
                  label="Unvan / Görev"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Genel Başkan, Genel Sekreter vb."
                />
                <Input
                  id="member-slug"
                  label="URL Kısa Adı"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder="ahmet-yilmaz"
                  helperText="Ad soyaddan otomatik oluşur. Üyenin adresi: /yonetim-kurulu/bu-ad"
                />
              </section>

              {/* Hakkında */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Hakkında</p>
                <FormField label="Özgeçmiş / Biyografi">
                  <RichTextEditor
                    content={form.bio}
                    onChange={(html) => setForm({ ...form, bio: html })}
                  />
                </FormField>
              </section>
            </div>

            {/* Sağ sütun — Fotoğraf ve iletişim */}
            <div className="space-y-6 min-w-0">
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Fotoğraf</p>
                <FormField label="Üye Fotoğrafı">
                  <ImageUploader
                    value={form.photo}
                    onChange={(url) => setForm({ ...form, photo: url })}
                    folder="board-members"
                    maxWidth={400}
                    maxHeight={500}
                  />
                </FormField>
                <p className="text-xs text-text-muted">
                  Önerilen: portre (dikey) oran, 400 × 500 piksel.
                </p>
              </section>

              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">İletişim</p>
                <Input
                  id="member-phone"
                  label="Telefon"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+90 (312) 000 00 00"
                  helperText="Opsiyonel"
                />
                <Input
                  id="member-email"
                  label="E-posta"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="uye@sendika.tr"
                  helperText="Opsiyonel"
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
                  <p className="text-xs text-text-muted mt-1.5">
                    Pasif üyeler sitede görünmez.
                  </p>
                </FormField>
              </section>

              <p className="text-xs text-text-muted pt-2">
                Sıralama liste sayfasında sürükle-bırak ile yapılır.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-5 mt-6 border-t border-border">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>İptal</Button>
          <Button onClick={handleSave} loading={saving}>
            {form.id ? "Değişiklikleri Kaydet" : "Üye Ekle"}
          </Button>
        </div>
      </Modal>

      <DeleteModal
        isOpen={!!deleteItem}
        onClose={() => setDeleteItem(null)}
        onConfirm={handleDelete}
        loading={deleting}
        description={`"${deleteItem?.name}" üyesini silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
