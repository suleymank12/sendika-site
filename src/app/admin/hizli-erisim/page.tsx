// Supabase SQL Editor'de çalıştırın (kolonlar yoksa ekler):
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS content TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS slug TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS video_url TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS youtube_url TEXT;
// ALTER TABLE quick_access ADD COLUMN IF NOT EXISTS image_url TEXT;

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import DataTable, { Column } from "@/components/admin/DataTable";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import Input from "@/components/ui/Input";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import EmptyState from "@/components/ui/EmptyState";
import ImageUploader from "@/components/admin/ImageUploader";
import MediaUploader from "@/components/admin/MediaUploader";
import RichTextEditor from "@/components/admin/RichTextEditor";
import FormField from "@/components/admin/FormField";
import { Plus, Zap } from "lucide-react";
import { QuickAccess } from "@/types";
import { createSlug } from "@/lib/utils";
import toast from "react-hot-toast";
import * as LucideIcons from "lucide-react";

interface QuickAccessFormData {
  id?: string;
  title: string;
  icon: string;
  image_url: string;
  url: string;
  slug: string;
  content: string;
  video_url: string;
  youtube_url: string;
  order: number;
  is_active: boolean;
}

const emptyForm: QuickAccessFormData = {
  title: "",
  icon: "",
  image_url: "",
  url: "",
  slug: "",
  content: "",
  video_url: "",
  youtube_url: "",
  order: 0,
  is_active: true,
};

const iconSuggestions = [
  "FileText", "Phone", "Mail", "MapPin", "Calendar", "Users",
  "Briefcase", "BookOpen", "Shield", "Scale", "Gavel", "Heart",
  "Award", "ClipboardList", "Download", "ExternalLink",
];

function getIconComponent(iconName: string) {
  const icons = LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>;
  return icons[iconName] || null;
}

export default function AdminQuickAccessPage() {
  const [items, setItems] = useState<QuickAccess[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<QuickAccessFormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteItem, setDeleteItem] = useState<QuickAccess | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase.from("quick_access").select("*").order("order", { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (!slugManuallyEdited && form.title && !form.id) {
      setForm((prev) => ({ ...prev, slug: createSlug(prev.title) }));
    }
  }, [form.title, form.id, slugManuallyEdited]);

  const openNew = () => {
    setForm(emptyForm);
    setSlugManuallyEdited(false);
    setModalOpen(true);
  };

  const handleEdit = (item: QuickAccess) => {
    setForm({
      id: item.id,
      title: item.title,
      icon: item.icon || "",
      image_url: item.image_url || "",
      url: item.url || "",
      slug: item.slug || "",
      content: item.content || "",
      video_url: item.video_url || "",
      youtube_url: item.youtube_url || "",
      order: item.order,
      is_active: item.is_active,
    });
    setSlugManuallyEdited(true);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur.");
      return;
    }

    const finalSlug = form.slug.trim() || createSlug(form.title);
    if (!finalSlug) {
      toast.error("Slug oluşturulamadı. Başlığı kontrol edin.");
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      title: form.title.trim(),
      icon: form.icon.trim() || null,
      image_url: form.image_url.trim() || null,
      url: form.url.trim() || `/hizli-erisim/${finalSlug}`,
      slug: finalSlug,
      content: form.content || null,
      video_url: form.video_url.trim() || null,
      youtube_url: form.youtube_url.trim() || null,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (form.id) {
      ({ error } = await supabase.from("quick_access").update(payload).eq("id", form.id));
    } else {
      ({ error } = await supabase.from("quick_access").insert(payload));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme başarısız oldu.");
      }
    } else {
      toast.success(form.id ? "Buton güncellendi." : "Buton eklendi.");
      setModalOpen(false);
      setForm(emptyForm);
      setSlugManuallyEdited(false);
      fetchItems();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("quick_access").delete().eq("id", deleteItem.id);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Buton silindi.");
      fetchItems();
    }
    setDeleteItem(null);
    setDeleting(false);
  };

  const columns: Column<QuickAccess>[] = [
    {
      key: "preview",
      label: "Önizleme",
      className: "w-20",
      render: (item) => {
        if (item.image_url) {
          // eslint-disable-next-line @next/next/no-img-element
          return <img src={item.image_url} alt={item.title} className="h-10 w-14 rounded object-cover" />;
        }
        const Icon = item.icon ? getIconComponent(item.icon) : null;
        return Icon ? <Icon className="h-5 w-5 text-primary" /> : <span className="text-text-muted">-</span>;
      },
    },
    {
      key: "title",
      label: "Başlık",
      render: (item) => <span className="font-medium text-text-dark">{item.title}</span>,
    },
    {
      key: "slug",
      label: "Slug",
      className: "hidden md:table-cell",
      render: (item) => <span className="text-text-muted text-xs">{item.slug || "-"}</span>,
    },
    {
      key: "order",
      label: "Sıra",
      className: "w-16",
      render: (item) => <span className="text-text-muted">{item.order}</span>,
    },
    {
      key: "is_active",
      label: "Durum",
      render: (item) => (
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${item.is_active ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          {item.is_active ? "Aktif" : "Pasif"}
        </span>
      ),
    },
  ];

  return (
    <>
      <AdminHeader title="Hızlı Erişim Butonları" />
      <div className="p-4 lg:p-6">
        <div className="rounded-xl bg-white border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-text-muted">Anasayfadaki hızlı erişim butonlarını yönetin.</p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Yeni Buton Ekle
            </Button>
          </div>

          {loading ? (
            <Loading className="py-12" text="Yükleniyor..." />
          ) : items.length === 0 ? (
            <EmptyState
              icon={Zap}
              title="Henüz hızlı erişim butonu yok"
              description="Anasayfada görünecek hızlı erişim butonları ekleyin."
              actionLabel="Yeni Buton Ekle"
              onAction={openNew}
            />
          ) : (
            <DataTable
              columns={columns}
              data={items}
              onEdit={handleEdit}
              onDelete={(item) => setDeleteItem(item)}
            />
          )}
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={form.id ? "Buton Düzenle" : "Yeni Buton Ekle"}
        className="max-w-2xl"
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <Input
            id="qa-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Toplu Sözleşme"
            required
          />

          <Input
            id="qa-slug"
            label="Slug (URL)"
            value={form.slug}
            onChange={(e) => {
              setForm({ ...form, slug: e.target.value });
              setSlugManuallyEdited(true);
            }}
            placeholder="toplu-sozlesme"
            helperText="/hizli-erisim/slug-buraya-gelecek — başlıktan otomatik oluşturulur"
          />

          <FormField label="Kapak Görseli (opsiyonel)">
            <ImageUploader
              value={form.image_url}
              onChange={(url) => setForm({ ...form, image_url: url })}
              folder="quick-access"
              maxWidth={800}
              maxHeight={500}
            />
            <p className="text-xs text-text-muted mt-1.5">
              Görsel yüklenirse ikon yerine görsel gösterilir. Görsel yoksa ikon kullanılır.
            </p>
          </FormField>

          <FormField label="İçerik">
            <RichTextEditor
              content={form.content}
              onChange={(html) => setForm({ ...form, content: html })}
            />
          </FormField>

          <FormField label="Video (opsiyonel)">
            <MediaUploader
              value={form.video_url}
              onChange={(url) => setForm({ ...form, video_url: url })}
              youtubeUrl={form.youtube_url}
              onYoutubeChange={(url) => setForm({ ...form, youtube_url: url })}
              folder="quick-access/videos"
            />
          </FormField>

          <div>
            <Input
              id="qa-icon"
              label="Lucide İkon Adı"
              value={form.icon}
              onChange={(e) => setForm({ ...form, icon: e.target.value })}
              placeholder="FileText"
              helperText="Görsel yoksa kullanılır (ör: FileText, Phone, Mail)"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {iconSuggestions.map((name) => {
                const Icon = getIconComponent(name);
                if (!Icon) return null;
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setForm({ ...form, icon: name })}
                    className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs transition-colors ${form.icon === name ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:border-primary/50"}`}
                    title={name}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              id="qa-order"
              label="Sıra"
              type="number"
              value={String(form.order)}
              onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
            />
            <div>
              <label className="block text-sm font-medium text-text-dark mb-1">Durum</label>
              <select
                value={form.is_active ? "true" : "false"}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === "true" })}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="true">Aktif</option>
                <option value="false">Pasif</option>
              </select>
            </div>
          </div>

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
        description={`"${deleteItem?.title}" butonunu silmek istediğinize emin misiniz?`}
      />
    </>
  );
}
