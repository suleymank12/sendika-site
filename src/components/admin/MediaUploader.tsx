"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { Upload, X, Film } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface MediaUploaderProps {
  value: string;
  onChange: (url: string) => void;
  youtubeUrl?: string;
  onYoutubeChange?: (url: string) => void;
  bucket?: string;
  folder?: string;
}

function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `https://www.youtube.com/embed/${match[1]}`;
  }
  return null;
}

export default function MediaUploader({
  value,
  onChange,
  youtubeUrl = "",
  onYoutubeChange,
  bucket = "images",
  folder = "uploads",
}: MediaUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const isVideo = value && /\.(mp4|webm|ogg|mov)$/i.test(value);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("video/")) {
        toast.error("Sadece video dosyaları yüklenebilir.");
        return;
      }

      if (file.size > 400 * 1024 * 1024) {
        toast.error("Video boyutu 400MB'dan küçük olmalıdır.");
        return;
      }

      setUploading(true);
      try {
        const supabase = createClient();
        const ext = file.name.split(".").pop();
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error } = await supabase.storage.from(bucket).upload(fileName, file);

        if (error) throw error;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        onChange(urlData.publicUrl);
        toast.success("Video yüklendi.");
      } catch {
        toast.error("Video yüklenirken hata oluştu.");
      } finally {
        setUploading(false);
      }
    },
    [bucket, folder, onChange]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) uploadFile(file);
    },
    [uploadFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const embedUrl = youtubeUrl ? getYoutubeEmbedUrl(youtubeUrl) : null;

  return (
    <div className="space-y-3">
      {/* File Upload */}
      {value ? (
        <div className="relative group rounded-lg overflow-hidden border border-border">
          {isVideo ? (
            <video
              src={value}
              controls
              className="w-full h-48 object-cover bg-black"
            />
          ) : (
            <div className="relative w-full h-48">
              <Image
                src={value}
                alt="Yüklenen medya"
                fill
                sizes="(max-width: 768px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 cursor-pointer transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
            uploading && "pointer-events-none opacity-50"
          )}
        >
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-text-muted">Yükleniyor...</span>
            </div>
          ) : (
            <>
              <div className="rounded-full bg-bg-light p-3">
                {dragOver ? (
                  <Film className="h-6 w-6 text-primary" />
                ) : (
                  <Upload className="h-6 w-6 text-text-muted" />
                )}
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-text-dark">
                  Video yüklemek için tıklayın veya sürükleyin
                </p>
                <p className="text-xs text-text-muted mt-1">
                  MP4, WEBM, MOV (maks. 400MB)
                </p>
              </div>
            </>
          )}
          <input
            type="file"
            accept="video/*"
            onChange={handleChange}
            className="hidden"
          />
        </label>
      )}

      {/* YouTube URL */}
      {onYoutubeChange && (
        <div>
          <label className="block text-sm font-medium text-text-dark mb-1">
            YouTube URL (opsiyonel)
          </label>
          <input
            type="url"
            value={youtubeUrl}
            onChange={(e) => onYoutubeChange(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          {embedUrl && (
            <div className="mt-2 rounded-lg overflow-hidden border border-border">
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <iframe
                  src={embedUrl}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title="YouTube video"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
