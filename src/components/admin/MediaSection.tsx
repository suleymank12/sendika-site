// Supabase SQL Editor'de çalıştırın (çoklu fotoğraf galerisi için):
// CREATE TABLE IF NOT EXISTS content_media (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   content_type TEXT NOT NULL,
//   content_id UUID NOT NULL,
//   media_type TEXT NOT NULL DEFAULT 'image',
//   url TEXT NOT NULL,
//   "order" INTEGER DEFAULT 0,
//   created_at TIMESTAMPTZ DEFAULT now()
// );
//
// ALTER TABLE content_media ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Public read media" ON content_media FOR SELECT USING (true);
// CREATE POLICY "Auth full access media" ON content_media FOR ALL USING (auth.role() = 'authenticated');

"use client";

import { useState } from "react";
import { Upload, X, GripVertical } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import toast from "react-hot-toast";
import ImageUploader from "./ImageUploader";
import MediaUploader from "./MediaUploader";
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

interface MediaSectionProps {
  folder: string;
  coverImage: string;
  onCoverImageChange: (url: string) => void;
  videoUrl: string;
  onVideoChange: (url: string) => void;
  youtubeUrl: string;
  onYoutubeChange: (url: string) => void;
  coverMaxWidth?: number;
  coverMaxHeight?: number;
  contentType?: string;
  contentId?: string | null;
  galleryImages?: string[];
  onGalleryChange?: (images: string[]) => void;
}

function SortableGalleryItem({
  url,
  onRemove,
}: {
  url: string;
  onRemove: (url: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: url });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="relative group aspect-square rounded border border-gray-200 overflow-hidden bg-gray-50"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="w-full h-full object-cover" />
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="absolute bottom-1 left-1 rounded bg-white/90 p-1 text-text-dark opacity-0 group-hover:opacity-100 transition-opacity cursor-grab"
        aria-label="Sürükle"
      >
        <GripVertical className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={() => onRemove(url)}
        className="absolute top-1 right-1 rounded-full bg-black/70 hover:bg-error p-1 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        aria-label="Kaldır"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

export default function MediaSection({
  folder,
  coverImage,
  onCoverImageChange,
  videoUrl,
  onVideoChange,
  youtubeUrl,
  onYoutubeChange,
  coverMaxWidth = 1200,
  coverMaxHeight = 675,
  contentType,
  galleryImages,
  onGalleryChange,
}: MediaSectionProps) {
  const [uploading, setUploading] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const gallery = galleryImages ?? [];
  const galleryEnabled = !!onGalleryChange;

  const galleryFolder = contentType ? `${contentType}/gallery` : `${folder}/gallery`;

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !onGalleryChange) return;

    setUploading(true);
    const supabase = createClient();
    const newUrls: string[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name} 5MB'dan büyük, atlandı.`);
        continue;
      }

      const ext = file.name.split(".").pop();
      const fileName = `${galleryFolder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: uploadError } = await supabase.storage.from("images").upload(fileName, file);
      if (uploadError) continue;

      const { data: urlData } = supabase.storage.from("images").getPublicUrl(fileName);
      newUrls.push(urlData.publicUrl);
    }

    if (newUrls.length > 0) {
      onGalleryChange([...gallery, ...newUrls]);
      toast.success(`${newUrls.length} fotoğraf yüklendi.`);
    } else {
      toast.error("Fotoğraf yüklenemedi.");
    }

    setUploading(false);
    e.target.value = "";
  };

  const handleRemove = (url: string) => {
    if (!onGalleryChange) return;
    onGalleryChange(gallery.filter((u) => u !== url));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onGalleryChange) return;
    const oldIndex = gallery.findIndex((u) => u === active.id);
    const newIndex = gallery.findIndex((u) => u === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    onGalleryChange(arrayMove(gallery, oldIndex, newIndex));
  };

  return (
    <div className="rounded-xl bg-white border border-border p-5">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Medya (Opsiyonel)</h3>

      <div className="space-y-4">
        <div className="mb-4">
          <label className="block text-sm font-medium text-text-dark mb-1.5">
            Kapak Görseli
          </label>
          <div className="max-w-lg">
            <ImageUploader
              value={coverImage}
              onChange={onCoverImageChange}
              folder={folder}
              maxWidth={coverMaxWidth}
              maxHeight={coverMaxHeight}
            />
          </div>
        </div>

        <div className="max-w-lg">
          <MediaUploader
            value={videoUrl}
            onChange={onVideoChange}
            youtubeUrl={youtubeUrl}
            onYoutubeChange={onYoutubeChange}
            folder={`${folder}/videos`}
          />
        </div>

        {galleryEnabled && (
          <div className="pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-text-dark">
                Fotoğraf Galerisi
              </label>
              <label
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                  uploading
                    ? "bg-primary/50 text-white pointer-events-none"
                    : "bg-primary text-white hover:bg-primary-dark"
                }`}
              >
                {uploading ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Yükleniyor...
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Fotoğraf Ekle
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleGalleryUpload}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>

            {gallery.length === 0 ? (
              <p className="text-xs text-text-muted text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                Henüz fotoğraf eklenmedi. Birden fazla fotoğraf seçebilirsiniz.
              </p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={gallery} strategy={rectSortingStrategy}>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {gallery.map((url) => (
                      <SortableGalleryItem key={url} url={url} onRemove={handleRemove} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
