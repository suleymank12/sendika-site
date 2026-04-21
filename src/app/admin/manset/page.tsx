// Supabase SQL Editor'de çalıştırın (kolon yoksa ekler):
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS content TEXT;
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS video_url TEXT;
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS youtube_url TEXT;

"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import ImageUploader from "@/components/admin/ImageUploader";
import MediaUploader from "@/components/admin/MediaUploader";
import RichTextEditor from "@/components/admin/RichTextEditor";
import FormField from "@/components/admin/FormField";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import { GripVertical, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Headline, News, Announcement } from "@/types";
import toast from "react-hot-toast";

type SourceType = "custom" | "news" | "announcement";

interface HeadlineForm {
  title: string;
  subtitle: string;
  image_url: string;
  link_url: string;
  source_type: SourceType;
  source_id: string;
  content: string;
  video_url: string;
  youtube_url: string;
  order: number;
  is_active: boolean;
}

const emptyForm: HeadlineForm = {
  title: "",
  subtitle: "",
  image_url: "",
  link_url: "",
  source_type: "custom",
  source_id: "",
  content: "",
  video_url: "",
  youtube_url: "",
  order: 0,
  is_active: true,
};

export default function AdminHeadlinePage() {
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<HeadlineForm>(emptyForm);

  // Delete
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Source data
  const [newsList, setNewsList] = useState<News[]>([]);
  const [announcementList, setAnnouncementList] = useState<Announcement[]>([]);

  // Drag
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const fetchHeadlines = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("headlines")
      .select("*")
      .order("order", { ascending: true });
    setHeadlines(data || []);
    setLoading(false);
  }, []);

  const fetchSources = useCallback(async () => {
    const supabase = createClient();
    const [newsRes, annRes] = await Promise.all([
      supabase
        .from("news")
        .select("id, title, slug, cover_image, is_published")
        .eq("is_published", true)
        .order("published_at", { ascending: false }),
      supabase
        .from("announcements")
        .select("id, title, slug, cover_image, is_published")
        .eq("is_published", true)
        .order("published_at", { ascending: false }),
    ]);
    setNewsList((newsRes.data as News[]) || []);
    setAnnouncementList((annRes.data as Announcement[]) || []);
  }, []);

  useEffect(() => {
    fetchHeadlines();
    fetchSources();
  }, [fetchHeadlines, fetchSources]);

  const openNew = () => {
    if (headlines.length >= 10) {
      toast.error("En fazla 10 manşet eklenebilir.");
      return;
    }
    setEditingId(null);
    setForm({ ...emptyForm, order: headlines.length });
    setModalOpen(true);
  };

  const openEdit = (h: Headline) => {
    setEditingId(h.id);
    setForm({
      title: h.title,
      subtitle: h.subtitle || "",
      image_url: h.image_url || "",
      link_url: h.link_url || "",
      source_type: (h.source_type as SourceType) || "custom",
      source_id: h.source_id || "",
      content: h.content || "",
      video_url: h.video_url || "",
      youtube_url: h.youtube_url || "",
      order: h.order,
      is_active: h.is_active,
    });
    setModalOpen(true);
  };

  const handleSourceChange = (type: SourceType) => {
    setForm((prev) => ({ ...prev, source_type: type, source_id: "" }));
  };

  const handleSourceSelect = (id: string) => {
    const list = form.source_type === "news" ? newsList : announcementList;
    const item = list.find((i) => i.id === id);
    if (item) {
      setForm((prev) => ({
        ...prev,
        source_id: id,
        title: item.title,
        image_url: item.cover_image || prev.image_url,
        link_url:
          form.source_type === "news"
            ? `/haberler/${item.slug}`
            : `/duyurular/${item.slug}`,
      }));
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("Başlık zorunludur.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const payload = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url || null,
      link_url: form.link_url.trim() || null,
      source_type: form.source_type,
      source_id: form.source_id || null,
      content: form.source_type === "custom" ? form.content || null : null,
      video_url: form.source_type === "custom" ? form.video_url || null : null,
      youtube_url: form.source_type === "custom" ? form.youtube_url || null : null,
      order: form.order,
      is_active: form.is_active,
    };

    let error;
    if (editingId) {
      ({ error } = await supabase.from("headlines").update(payload).eq("id", editingId));
    } else {
      ({ error } = await supabase.from("headlines").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      toast.success(editingId ? "Manşet güncellendi." : "Manşet eklendi.");
      setModalOpen(false);
      fetchHeadlines();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const supabase = createClient();
    const { error } = await supabase.from("headlines").delete().eq("id", deleteId);
    if (error) {
      toast.error("Silme başarısız oldu.");
    } else {
      toast.success("Manşet silindi.");
      setDeleteId(null);
      fetchHeadlines();
    }
    setDeleting(false);
  };

  const toggleActive = async (h: Headline) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("headlines")
      .update({ is_active: !h.is_active })
      .eq("id", h.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setHeadlines((prev) =>
        prev.map((item) => (item.id === h.id ? { ...item, is_active: !item.is_active } : item))
      );
    }
  };

  // Drag & Drop
  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === index) return;

    const updated = [...headlines];
    const [moved] = updated.splice(dragIndex, 1);
    updated.splice(index, 0, moved);
    setHeadlines(updated);
    setDragIndex(index);
  };

  const handleDragEnd = async () => {
    setDragIndex(null);
    const supabase = createClient();
    const updates = headlines.map((h, i) =>
      supabase.from("headlines").update({ order: i }).eq("id", h.id)
    );
    const results = await Promise.all(updates);
    if (results.some((r) => r.error)) {
      toast.error("Sıralama kaydedilemedi.");
      fetchHeadlines();
    } else {
      toast.success("Sıralama güncellendi.");
    }
  };

  if (loading) {
    return (
      <>
        <AdminHeader title="Manşet Yönetimi" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title="Manşet Yönetimi"
        action={
          <Button onClick={openNew} size="sm">
            <Plus className="h-4 w-4" />
            Yeni Manşet Ekle
          </Button>
        }
      />

      <div className="p-4 lg:p-6">
        {headlines.length >= 10 && (
          <div className="mb-4 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning">
            Maksimum manşet sayısına (10) ulaşıldı.
          </div>
        )}

        {headlines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted">
            <p className="text-lg font-medium mb-1">Henüz manşet eklenmemiş</p>
            <p className="text-sm mb-4">Yeni bir manşet ekleyerek başlayın.</p>
            <Button onClick={openNew} size="sm">
              <Plus className="h-4 w-4" />
              Manşet Ekle
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {headlines.map((h, index) => (
              <div
                key={h.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-4 rounded-xl bg-white border border-border p-4 transition-opacity ${
                  dragIndex === index ? "opacity-50" : ""
                } ${!h.is_active ? "opacity-60" : ""}`}
              >
                <div className="cursor-grab text-text-muted hover:text-text-dark">
                  <GripVertical className="h-5 w-5" />
                </div>

                {h.image_url ? (
                  <img
                    src={h.image_url}
                    alt={h.title}
                    className="w-20 h-14 object-cover rounded-lg shrink-0"
                  />
                ) : (
                  <div className="w-20 h-14 bg-bg-light rounded-lg flex items-center justify-center text-text-muted text-xs shrink-0">
                    Görsel yok
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-text-dark truncate">{h.title}</h4>
                  {h.subtitle && (
                    <p className="text-sm text-text-muted truncate">{h.subtitle}</p>
                  )}
                  <span className="text-xs text-text-muted">
                    {h.source_type === "news"
                      ? "Haber"
                      : h.source_type === "announcement"
                      ? "Duyuru"
                      : "Özel"}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleActive(h)}
                    className="p-2 rounded-lg hover:bg-bg-light text-text-muted transition-colors"
                    title={h.is_active ? "Pasife al" : "Aktif et"}
                  >
                    {h.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => openEdit(h)}
                    className="p-2 rounded-lg hover:bg-bg-light text-text-muted transition-colors"
                    title="Düzenle"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(h.id)}
                    className="p-2 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                    title="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Manşet Düzenle" : "Yeni Manşet Ekle"}
        className="max-w-xl"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Kaynak Seçimi */}
          <div>
            <label className="block text-sm font-medium text-text-dark mb-2">Kaynak</label>
            <div className="flex gap-2">
              {(["custom", "news", "announcement"] as SourceType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleSourceChange(type)}
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.source_type === type
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border text-text-muted hover:border-primary/30"
                  }`}
                >
                  {type === "custom" ? "Özel" : type === "news" ? "Haberden" : "Duyurudan"}
                </button>
              ))}
            </div>
          </div>

          {/* Haber/Duyuru Seçimi */}
          {form.source_type !== "custom" && (
            <div>
              <label className="block text-sm font-medium text-text-dark mb-1">
                {form.source_type === "news" ? "Haber Seç" : "Duyuru Seç"}
              </label>
              <select
                value={form.source_id}
                onChange={(e) => handleSourceSelect(e.target.value)}
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <option value="">Seçiniz...</option>
                {(form.source_type === "news" ? newsList : announcementList).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Başlık */}
          <Input
            id="headline-title"
            label="Başlık"
            value={form.title}
            onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
            placeholder="Manşet başlığı"
            required
          />

          {/* Alt Başlık */}
          <Input
            id="headline-subtitle"
            label="Alt Başlık"
            value={form.subtitle}
            onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
            placeholder="Opsiyonel alt başlık"
          />

          {/* Görsel */}
          <FormField label="Görsel">
            <ImageUploader
              value={form.image_url}
              onChange={(url) => setForm((p) => ({ ...p, image_url: url }))}
              folder="headlines"
              maxWidth={1400}
              maxHeight={600}
            />
          </FormField>

          {/* Link URL */}
          <Input
            id="headline-link"
            label="Link URL"
            value={form.link_url}
            onChange={(e) => setForm((p) => ({ ...p, link_url: e.target.value }))}
            placeholder="/haberler/ornek-haber"
            helperText={
              form.source_type === "custom"
                ? "Boş bırakılırsa manşet kendi detay sayfasında açılır."
                : undefined
            }
          />

          {/* İçerik — yalnızca custom kaynakta */}
          {form.source_type === "custom" && (
            <>
              <FormField label="İçerik (opsiyonel)">
                <RichTextEditor
                  content={form.content}
                  onChange={(html) => setForm((p) => ({ ...p, content: html }))}
                />
              </FormField>

              <div className="border-t border-gray-200 pt-4 mt-2">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Medya (Opsiyonel)</h4>
                <MediaUploader
                  value={form.video_url}
                  onChange={(url) => setForm((p) => ({ ...p, video_url: url }))}
                  youtubeUrl={form.youtube_url}
                  onYoutubeChange={(url) => setForm((p) => ({ ...p, youtube_url: url }))}
                  folder="headlines/videos"
                />
              </div>
            </>
          )}

          {/* Sıra */}
          <Input
            id="headline-order"
            label="Sıra Numarası"
            type="number"
            value={String(form.order)}
            onChange={(e) => setForm((p) => ({ ...p, order: parseInt(e.target.value) || 0 }))}
          />
        </div>

        <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-border">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            İptal
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {editingId ? "Güncelle" : "Ekle"}
          </Button>
        </div>
      </Modal>

      {/* Delete Modal */}
      <DeleteModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Manşet Silme"
        description="Bu manşeti silmek istediğinize emin misiniz?"
      />
    </>
  );
}
