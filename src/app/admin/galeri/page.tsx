"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import ImageUploader from "@/components/admin/ImageUploader";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import FormField from "@/components/admin/FormField";
import { Plus, Edit, Trash2, GalleryHorizontal, ImageIcon, GripVertical } from "lucide-react";
import { GalleryAlbum } from "@/types";
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

interface AlbumFormData {
  id?: string;
  title: string;
  cover_image: string;
  is_published: boolean;
}

const emptyForm: AlbumFormData = {
  title: "",
  cover_image: "",
  is_published: true,
};

type AlbumWithCount = GalleryAlbum & { image_count: number };

function SortableAlbumCard({
  album,
  onOpen,
  onEdit,
  onDelete,
}: {
  album: AlbumWithCount;
  onOpen: (id: string) => void;
  onEdit: (album: AlbumWithCount) => void;
  onDelete: (album: AlbumWithCount) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: album.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="rounded-xl border border-border bg-white overflow-hidden cursor-pointer hover:shadow-md transition-shadow relative"
      onClick={() => onOpen(album.id)}
    >
      <button
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 left-2 z-10 rounded-lg bg-black/50 p-1.5 text-white cursor-grab touch-none"
        aria-label="Sürükle"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <div className="relative h-40">
        {album.cover_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={album.cover_image} alt={album.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-bg-light flex items-center justify-center">
            <ImageIcon className="h-12 w-12 text-text-muted/30" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-text-dark">{album.title}</p>
        <p className="text-xs text-text-muted mt-0.5">{album.image_count} fotoğraf</p>
        <div className="flex items-center justify-between mt-3">
          <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${album.is_published ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
            {album.is_published ? "Yayında" : "Taslak"}
          </span>
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onEdit(album)}
              className="p-1.5 text-text-muted hover:text-primary rounded-lg hover:bg-primary/10"
            >
              <Edit className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(album)}
              className="p-1.5 text-text-muted hover:text-error rounded-lg hover:bg-error/10"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminGalleryPage() {
  const router = useRouter();
  const [albums, setAlbums] = useState<AlbumWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<AlbumFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<GalleryAlbum | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchAlbums = useCallback(async () => {
    const supabase = createClient();
    const { data: albumsData } = await supabase
      .from("gallery_albums")
      .select("*, gallery_images(count)")
      .order("order", { ascending: true });

    const albums = (albumsData || []).map((album: Record<string, unknown>) => ({
      ...album,
      image_count: Array.isArray(album.gallery_images) && album.gallery_images[0]
        ? (album.gallery_images[0] as { count: number }).count
        : 0,
    })) as (GalleryAlbum & { image_count: number })[];

    setAlbums(albums);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Albüm adı zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      cover_image: form.cover_image || null,
      is_published: form.is_published,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("gallery_albums").update(payload).eq("id", form.id));
    } else {
      payload.order = albums.length;
      ({ error } = await supabase.from("gallery_albums").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(form.id ? "Albüm güncellendi." : "Albüm oluşturuldu.");
      setModalOpen(false);
      setForm(emptyForm);
      fetchAlbums();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("gallery_albums").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Albüm silindi.");
      fetchAlbums();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = albums.findIndex((a) => a.id === active.id);
    const newIndex = albums.findIndex((a) => a.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(albums, oldIndex, newIndex);
    setAlbums(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((a, idx) =>
        supabase.from("gallery_albums").update({ order: idx }).eq("id", a.id)
      )
    );
    toast.success("Sıralama kaydedildi.");
  };

  const handleEditAlbum = (album: AlbumWithCount) => {
    setForm({
      id: album.id,
      title: album.title,
      cover_image: album.cover_image || "",
      is_published: album.is_published,
    });
    setModalOpen(true);
  };

  return (
    <>
      <AdminHeader title="Galeri Yönetimi" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={() => { setForm(emptyForm); setModalOpen(true); }}>
              <Plus className="h-4 w-4" />
              Yeni Albüm
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : albums.length === 0 ? (
            <EmptyState
              icon={GalleryHorizontal}
              title="Henüz albüm eklenmemiş"
              description="Galeri albümü oluşturarak fotoğraf yüklemeye başlayın."
              actionLabel="Yeni Albüm"
              onAction={() => { setForm(emptyForm); setModalOpen(true); }}
            />
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={albums.map((a) => a.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {albums.map((album) => (
                    <SortableAlbumCard
                      key={album.id}
                      album={album}
                      onOpen={(id) => router.push(`/admin/galeri/${id}`)}
                      onEdit={handleEditAlbum}
                      onDelete={setDeleteItem}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={form.id ? "Albüm Düzenle" : "Yeni Albüm"}>
        <div className="space-y-4">
          <Input
            id="album-title"
            label="Albüm Adı"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Albüm adı"
            required
          />
          <FormField label="Kapak Görseli">
            <ImageUploader value={form.cover_image} onChange={(url) => setForm({ ...form, cover_image: url })} folder="gallery" />
          </FormField>
          <Select
            label="Durum"
            value={form.is_published ? "true" : "false"}
            onChange={(e) => setForm({ ...form, is_published: e.target.value === "true" })}
          >
            <option value="true">Yayında</option>
            <option value="false">Taslak</option>
          </Select>
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
        description={`"${deleteItem?.title}" albümünü ve tüm fotoğraflarını silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
