"use client";

import { useState, useCallback } from "react";
import NextImage from "next/image";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  maxWidth?: number;
  maxHeight?: number;
}

function resizeImage(file: File, maxWidth: number, maxHeight: number): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;

      if (width <= maxWidth && height <= maxHeight) {
        resolve(file);
        return;
      }

      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.round(width * ratio);
      height = Math.round(height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Görsel boyutlandırma başarısız."));
            return;
          }
          const resized = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
            type: "image/jpeg",
          });
          resolve(resized);
        },
        "image/jpeg",
        0.85
      );
    };
    img.onerror = () => reject(new Error("Görsel okunamadı."));
    img.src = URL.createObjectURL(file);
  });
}

export default function ImageUploader({
  value,
  onChange,
  bucket = "images",
  folder = "uploads",
  maxWidth,
  maxHeight,
}: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        toast.error("Sadece görsel dosyaları yüklenebilir.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        toast.error("Dosya boyutu 5MB'dan küçük olmalıdır.");
        return;
      }

      setUploading(true);
      try {
        let fileToUpload = file;
        if (maxWidth || maxHeight) {
          fileToUpload = await resizeImage(file, maxWidth ?? Infinity, maxHeight ?? Infinity);
        }

        const supabase = createClient();
        const ext = fileToUpload.name.split(".").pop();
        const fileName = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

        const { error } = await supabase.storage.from(bucket).upload(fileName, fileToUpload);

        if (error) throw error;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName);
        onChange(urlData.publicUrl);
        toast.success("Görsel yüklendi.");
      } catch {
        toast.error("Görsel yüklenirken hata oluştu.");
      } finally {
        setUploading(false);
      }
    },
    [bucket, folder, onChange, maxWidth, maxHeight]
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

  if (value) {
    return (
      <div className="relative group rounded-lg overflow-hidden border border-border h-48">
        <NextImage
          src={value}
          alt="Yüklenen görsel"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute top-2 right-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
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
              <ImageIcon className="h-6 w-6 text-primary" />
            ) : (
              <Upload className="h-6 w-6 text-text-muted" />
            )}
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-text-dark">
              Görsel yüklemek için tıklayın veya sürükleyin
            </p>
            <p className="text-xs text-text-muted mt-1">PNG, JPG, WEBP (maks. 5MB)</p>
          </div>
        </>
      )}
      <input type="file" accept="image/*" onChange={handleChange} className="hidden" />
    </label>
  );
}
