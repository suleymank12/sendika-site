"use client";

import { useState, useCallback } from "react";
import SafeImage from "@/components/SafeImage";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { buildStoragePath, generateFileName } from "@/lib/storage";
import { compressImage } from "@/lib/image-compress";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  bucket?: string;
  folder?: string;
  maxWidth?: number;
  maxHeight?: number;
  /** false: WebP'ye cevirme, formati koru (logo/favicon keskinligi icin). Default true. */
  toWebp?: boolean;
}

export default function ImageUploader({
  value,
  onChange,
  bucket = "images",
  folder = "uploads",
  maxWidth,
  maxHeight,
  toWebp = true,
}: ImageUploaderProps) {
  const { tenant } = useTenant();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const uploadFile = useCallback(
    async (file: File) => {
      // Tenant prefix'i olmadan yükleme yapılamaz
      if (!tenant) {
        toast.error("Tenant bilgisi yüklenmedi, lütfen sayfayı yenileyin.");
        return;
      }

      if (!file.type.startsWith("image/")) {
        toast.error("Sadece görsel dosyaları yüklenebilir.");
        return;
      }

      if (file.size > MAX_UPLOAD_MB.IMAGE * 1024 * 1024) {
        toast.error(`Dosya boyutu ${MAX_UPLOAD_MB.IMAGE}MB'dan küçük olmalıdır.`);
        return;
      }

      setUploading(true);
      try {
        let fileToUpload = file;
        if (maxWidth || maxHeight) {
          // Merkezi util: boyutlandir + (toWebp ise) WebP'ye cevir.
          // Hata/fayda yoksa orijinali doner (fallback korunur).
          fileToUpload = await compressImage(file, { maxWidth, maxHeight, toWebp });
        }

        const supabase = createClient();
        const fileName = generateFileName(fileToUpload.name);
        const filePath = buildStoragePath(tenant.id, folder, fileName);

        const { error } = await supabase.storage.from(bucket).upload(filePath, fileToUpload);

        if (error) throw error;

        const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(filePath);
        onChange(urlData.publicUrl);
        toast.success("Görsel yüklendi.");
      } catch {
        toast.error("Görsel yüklenirken hata oluştu.");
      } finally {
        setUploading(false);
      }
    },
    [bucket, folder, onChange, maxWidth, maxHeight, toWebp, tenant]
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
        <SafeImage
          src={value}
          alt="Yüklenen görsel"
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          fallback={
            <div className="h-full w-full bg-bg-light flex items-center justify-center text-text-muted text-xs">
              Görsel önizlenemiyor
            </div>
          }
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
            <p className="text-xs text-text-muted mt-1">{`PNG, JPG, WEBP (maks. ${MAX_UPLOAD_MB.IMAGE}MB)`}</p>
          </div>
        </>
      )}
      <input type="file" accept="image/*" onChange={handleChange} className="hidden" />
    </label>
  );
}
