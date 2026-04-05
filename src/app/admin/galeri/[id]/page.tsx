"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ImageUploader from "@/components/admin/ImageUploader";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import FormField from "@/components/admin/FormField";
import { ArrowLeft, Upload, Trash2, GripVertical } from "lucide-react";
import { GalleryAlbum, GalleryImage } from "@/types";
import toast from "react-hot-toast";
import Link from "next/link";
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

function SortableImage({
  image,
  onDelete,
}: {
  image: GalleryImage;
  onDelete: (image: GalleryImage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: image.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="relative group rounded-lg overflow-hidden border border-border">
      <img src={image.image_url} alt={image.caption || ""} className="w-full h-32 object-cover" />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
        <button {...attributes} {...listeners} className="rounded-lg bg-white/90 p-1.5 text-text-dark cursor-grab">
          <GripVertical className="h-4 w-4" />
        </button>
        <button onClick={() => onDelete(image)} className="rounded-lg bg-white/90 p-1.5 text-error">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function AdminGalleryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const albumId = params.id as string;

  const [album, setAlbum] = useState<GalleryAlbum | null>(null);
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteImage, setDeleteImage] = useState<GalleryImage | null>(null);
  const [deleting, setDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchData = useCallback(async () => {
    const supabase = createClient();
    const [albumRes, imagesRes] = await Promise.all([
      supabase.from("gallery_albums").select("*").eq("id", albumId).single(),
      supabase.from("gallery_images").select("*").eq("album_id", albumId).order("order", { ascending: true }),
    ]);

    if (albumRes.error || !albumRes.data) {
      toast.error("Albüm bulunamadı.");
      router.push("/admin/galeri");
      return;
    }

    setAlbum(albumRes.data);
    setTitle(albumRes.data.title);
    setCoverImage(albumRes.data.cover_image || "");
    setImages(imagesRes.data || []);
    setLoading(false);
  }, [albumId, router]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSaveAlbum = async () => {
    if (!title.trim()) {
      toast.error("Albüm adı zorunludur.");
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("gallery_albums")
      .update({ title: title.trim(), cover_image: coverImage || null })
      .eq("id", albumId);

    if (error) {
      toast.error("Güncelleme başarısız oldu.");
    } else {
      toast.success("Albüm güncellendi.");
    }
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const supabase = createClient();
    let successCount = 0;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      const ext = file.name.split(".").pop();
      const fileName = `gallery/${albumId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("images").upload(fileName, file);
      if (uploadError) continue;

      const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("gallery_images").insert({
        album_id: albumId,
        image_url: urlData.publicUrl,
        order: images.length + successCount,
      });

      if (!insertError) successCount++;
    }

    if (successCount > 0) {
      toast.success(`${successCount} fotoğraf yüklendi.`);
      fetchData();
    } else {
      toast.error("Fotoğraf yüklenemedi.");
    }

    setUploading(false);
    e.target.value = "";
  };

  const handleDeleteImage = async () => {
    if (!deleteImage) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("gallery_images").delete().eq("id", deleteImage.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Fotoğraf silindi.");
      setImages((prev) => prev.filter((i) => i.id !== deleteImage.id));
    }
    setDeleteImage(null);
    setDeleting(false);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = images.findIndex((i) => i.id === active.id);
    const newIndex = images.findIndex((i) => i.id === over.id);
    const reordered = arrayMove(images, oldIndex, newIndex);
    setImages(reordered);

    const supabase = createClient();
    await Promise.all(
      reordered.map((img, idx) => supabase.from("gallery_images").update({ order: idx }).eq("id", img.id))
    );
    toast.success("Sıralama kaydedildi.");
  };

  if (loading) {
    return (
      <>
        <AdminHeader title="Albüm Detay" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title={album?.title || "Albüm"} />
      <div className="p-4 lg:p-6 max-w-5xl">
        <Link href="/admin/galeri" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4" />
          Galeriye Dön
        </Link>

        {/* Album info */}
        <div className="rounded-xl bg-white border border-border p-5 mb-6 space-y-4">
          <h3 className="font-semibold text-text-dark">Albüm Bilgileri</h3>
          <Input
            id="album-title"
            label="Albüm Adı"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <FormField label="Kapak Görseli">
            <ImageUploader value={coverImage} onChange={setCoverImage} folder="gallery" />
          </FormField>
          <div className="flex justify-end">
            <Button onClick={handleSaveAlbum} loading={saving}>Albümü Kaydet</Button>
          </div>
        </div>

        {/* Photos */}
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-text-dark">Fotoğraflar ({images.length})</h3>
            <label className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors ${uploading ? "bg-primary/50 text-white" : "bg-primary text-white hover:bg-primary-dark"}`}>
              <Upload className="h-4 w-4" />
              {uploading ? "Yükleniyor..." : "Fotoğraf Yükle"}
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileUpload}
                disabled={uploading}
                className="hidden"
              />
            </label>
          </div>

          {images.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-8">
              Henüz fotoğraf yüklenmemiş. Yukarıdaki butonu kullanarak fotoğraf ekleyin.
            </p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={images.map((i) => i.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {images.map((image) => (
                    <SortableImage key={image.id} image={image} onDelete={setDeleteImage} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>
      </div>

      <DeleteModal
        isOpen={!!deleteImage}
        onClose={() => setDeleteImage(null)}
        onConfirm={handleDeleteImage}
        loading={deleting}
        description="Bu fotoğrafı silmek istediğinize emin misiniz?"
      />
    </>
  );
}
