"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Image as ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Undo,
  Redo,
  Loader2,
} from "lucide-react";
import { cn, normalizeExternalUrl } from "@/lib/utils";
import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { buildStoragePath, generateFileName } from "@/lib/storage";
import { compressImage } from "@/lib/image-compress";
import { MAX_UPLOAD_MB } from "@/lib/constants";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import toast from "react-hot-toast";

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "rounded p-1.5 transition-colors",
        active ? "bg-primary/10 text-primary" : "text-text-muted hover:bg-bg-light hover:text-text-dark",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ content, onChange }: RichTextEditorProps) {
  const { tenant } = useTenant();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Link ve Underline StarterKit v3'un icinde — ayrica eklenirse
      // duplicate kayit olusur ve openOnClick:false fiilen calismaz
      // (StarterKit'in openOnClick:true kopyasi devreye girer).
      StarterKit.configure({ link: { openOnClick: false } }),
      Image,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Link modali: acilista mevcut href dolu gelir (duzenleme), "Kaldir"
  // ile yanlis eklenen link cikarilabilir (unsetLink).
  const openLinkModal = useCallback(() => {
    if (!editor) return;
    setLinkUrl(editor.getAttributes("link").href || "");
    setLinkModalOpen(true);
  }, [editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = normalizeExternalUrl(linkUrl);
    if (!url) return;
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkModalOpen(false);
  }, [editor, linkUrl]);

  const removeLink = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    setLinkModalOpen(false);
  }, [editor]);

  const addImage = useCallback(async (file: File) => {
    if (!editor) return;
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
      // Sikistir + WebP'ye cevir (hata/fayda yoksa orijinal doner).
      // Genislik cap'i; yukseklik serbest — uzun infografikler ezilmesin.
      const compressed = await compressImage(file, { maxWidth: 1280, quality: 0.8 });

      const supabase = createClient();
      const fileName = generateFileName(compressed.name);
      const filePath = buildStoragePath(tenant.id, "editor", fileName);

      const { error } = await supabase.storage.from("images").upload(filePath, compressed);
      if (error) throw error;

      const { data: urlData } = supabase.storage.from("images").getPublicUrl(filePath);
      editor.chain().focus().setImage({ src: urlData.publicUrl }).run();
      toast.success("Görsel eklendi.");
    } catch {
      toast.error("Görsel yüklenemedi.");
    } finally {
      setUploading(false);
    }
  }, [editor, tenant]);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) addImage(file);
    e.target.value = "";
  };

  if (!editor) return null;

  const iconSize = "h-4 w-4";

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-bg-light p-1.5">
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          title="Kalın"
        >
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          title="İtalik"
        >
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          active={editor.isActive("underline")}
          title="Altı Çizili"
        >
          <UnderlineIcon className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          active={editor.isActive("heading", { level: 2 })}
          title="Başlık 2"
        >
          <Heading2 className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          active={editor.isActive("heading", { level: 3 })}
          title="Başlık 3"
        >
          <Heading3 className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          title="Madde İşareti"
        >
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          title="Numaralı Liste"
        >
          <ListOrdered className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          active={editor.isActive({ textAlign: "left" })}
          title="Sola Hizala"
        >
          <AlignLeft className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          active={editor.isActive({ textAlign: "center" })}
          title="Ortala"
        >
          <AlignCenter className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          active={editor.isActive({ textAlign: "right" })}
          title="Sağa Hizala"
        >
          <AlignRight className={iconSize} />
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        <ToolbarButton onClick={openLinkModal} active={editor.isActive("link")} title="Link Ekle">
          <LinkIcon className={iconSize} />
        </ToolbarButton>
        <ToolbarButton
          onClick={handleImageClick}
          title={uploading ? "Görsel yükleniyor..." : "Görsel Ekle"}
          disabled={uploading}
        >
          {uploading ? (
            <Loader2 className={cn(iconSize, "animate-spin text-primary")} />
          ) : (
            <ImageIcon className={iconSize} />
          )}
        </ToolbarButton>

        <div className="w-px h-6 bg-border mx-1" />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Geri Al">
          <Undo className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="İleri Al">
          <Redo className={iconSize} />
        </ToolbarButton>
      </div>

      {/* Editor */}
      <EditorContent editor={editor} className="tiptap" />

      {/* Hidden file input */}
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

      {/* Link modali — tek input, kayip riski yok: closeOnOverlay (Esc de kapatir) */}
      <Modal
        isOpen={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        title={editor.isActive("link") ? "Linki Düzenle" : "Link Ekle"}
        closeOnOverlay
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
          className="space-y-4"
        >
          <Input
            label="Link adresi"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://ornek.com veya www.ornek.com"
            helperText="Başına https:// yazmasanız da olur, otomatik eklenir."
          />
          <div className="flex items-center justify-end gap-2">
            {editor.isActive("link") && (
              <Button type="button" variant="danger" onClick={removeLink} className="mr-auto">
                Linki Kaldır
              </Button>
            )}
            <Button type="button" variant="secondary" onClick={() => setLinkModalOpen(false)}>
              İptal
            </Button>
            <Button type="submit" disabled={!linkUrl.trim()}>
              {editor.isActive("link") ? "Güncelle" : "Ekle"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
