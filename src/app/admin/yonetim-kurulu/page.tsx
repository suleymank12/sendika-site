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
import { Plus, Edit, Trash2, GripVertical, Users } from "lucide-react";
import { BoardMember } from "@/types";
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
  order: number;
  is_active: boolean;
}

const emptyForm: MemberFormData = {
  name: "",
  title: "",
  photo: "",
  order: 0,
  is_active: true,
};

function SortableMemberCard({
  item,
  onEdit,
  onDelete,
}: {
  item: BoardMember;
  onEdit: (item: BoardMember) => void;
  onDelete: (item: BoardMember) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="rounded-xl border border-border bg-white overflow-hidden">
      <div className="relative">
        {item.photo ? (
          <img src={item.photo} alt={item.name} className="w-full h-48 object-cover" />
        ) : (
          <div className="w-full h-48 bg-bg-light flex items-center justify-center">
            <Users className="h-12 w-12 text-text-muted/30" />
          </div>
        )}
        <button
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 rounded-lg bg-black/50 p-1.5 text-white cursor-grab"
        >
          <GripVertical className="h-4 w-4" />
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
  const [members, setMembers] = useState<BoardMember[]>([]);
  const [loading, setLoading] = useState(true);
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
    const supabase = createClient();
    const { data } = await supabase.from("board_members").select("*").order("order", { ascending: true });
    setMembers(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleEdit = (item: BoardMember) => {
    setForm({
      id: item.id,
      name: item.name,
      title: item.title || "",
      photo: item.photo || "",
      order: item.order,
      is_active: item.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Ad alanı zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: form.name.trim(),
      title: form.title.trim() || null,
      photo: form.photo || null,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("board_members").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("board_members").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Üye güncellendi." : "Üye eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchMembers();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("board_members").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Üye silindi.");
      fetchMembers();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = members.findIndex((i) => i.id === active.id);
    const newIndex = members.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(members, oldIndex, newIndex);
    setMembers(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((item, idx) => supabase.from("board_members").update({ order: idx }).eq("id", item.id))
    );
    toast.success("Sıralama kaydedildi.");
  };

  return (
    <>
      <AdminHeader title="Yönetim Kurulu" />
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
                    <SortableMemberCard key={item.id} item={item} onEdit={handleEdit} onDelete={setDeleteItem} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Üye Düzenle" : "Yeni Üye Ekle"}>
        <div className="space-y-4">
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
            label="Unvan"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Genel Başkan, Genel Sekreter vb."
          />
          <FormField label="Fotoğraf">
            <ImageUploader value={form.photo} onChange={(url) => setForm({ ...form, photo: url })} folder="board-members" maxWidth={400} maxHeight={500} />
          </FormField>
          <Input
            id="member-order"
            label="Sıra"
            type="number"
            value={String(form.order)}
            onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
          />
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
        description={`"${deleteItem?.name}" üyesini silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
