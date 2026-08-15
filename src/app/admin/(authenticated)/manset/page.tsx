// Supabase SQL Editor'de çalıştırın (kolon yoksa ekler):
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS content TEXT;
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS video_url TEXT;
// ALTER TABLE headlines ADD COLUMN IF NOT EXISTS youtube_url TEXT;

"use client";

import { useEffect, useState, useCallback } from "react";
import SafeImage from "@/components/SafeImage";
import { createClient } from "@/lib/supabase/client";
import {
  storagePathFromUrl,
  removeFilesFromStorage,
  purgeContentMedia,
  cleanupReplacedFile,
} from "@/lib/storage";
import { useTenant } from "@/hooks/useTenant";
import { normalizeExternalUrl } from "@/lib/utils";
import AdminHeader from "@/components/admin/AdminHeader";
import ListLoadError from "@/components/admin/ListLoadError";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Modal from "@/components/ui/Modal";
import ImageUploader from "@/components/admin/ImageUploader";
import MediaUploader from "@/components/admin/MediaUploader";
import RichTextEditor from "@/components/admin/RichTextEditor";
import FormField from "@/components/admin/FormField";
import DeleteModal from "@/components/admin/DeleteModal";
import Loading from "@/components/ui/Loading";
import { GripVertical, Plus, Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { Headline, News, Announcement } from "@/types";
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
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

function SortableHeadlineRow({
  h,
  onToggle,
  onEdit,
  onDelete,
}: {
  h: Headline;
  onToggle: (h: Headline) => void;
  onEdit: (h: Headline) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: h.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-4 rounded-xl bg-white border border-border p-4 ${
        !h.is_active ? "opacity-60" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-text-muted hover:text-text-dark touch-none"
        aria-label="Sürükle"
      >
        <GripVertical className="h-5 w-5" />
      </button>

      <SafeImage
        src={h.image_url}
        alt={h.title}
        width={80}
        height={56}
        className="w-20 h-14 object-cover rounded-lg shrink-0"
        fallback={
          <div className="w-20 h-14 bg-bg-light rounded-lg flex items-center justify-center text-text-muted text-xs shrink-0">
            Görsel yok
          </div>
        }
      />

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
          onClick={() => onToggle(h)}
          className="p-2 rounded-lg hover:bg-bg-light text-text-muted transition-colors"
          title={h.is_active ? "Pasife al" : "Aktif et"}
        >
          {h.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          onClick={() => onEdit(h)}
          className="p-2 rounded-lg hover:bg-bg-light text-text-muted transition-colors"
          title="Düzenle"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(h.id)}
          className="p-2 rounded-lg hover:bg-error/10 text-text-muted hover:text-error transition-colors"
          title="Sil"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

export default function AdminHeadlinePage() {
  const { tenant } = useTenant();
  const [headlines, setHeadlines] = useState<Headline[]>([]);
  const [loading, setLoading] = useState(true);
  // Fetch hatasi "bos liste" olarak GOSTERILMEZ (Tur 3 b1) — ListLoadError.
  const [loadFailed, setLoadFailed] = useState(false);
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

  // Drag — dnd-kit (PointerSensor dokunmatikte de calisir; eski HTML5
  // native draggable dokunmatik cihazlarda hic tetiklenmiyordu)
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchHeadlines = useCallback(async () => {
    if (!tenant) return;
    const supabase = createClient();
    const { data, error } = await supabase
      .from("headlines")
      .select("*")
      .eq("tenant_id", tenant.id)
      .order("order", { ascending: true });
    if (error) {
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    setHeadlines(data || []);
    setLoading(false);
  }, [tenant]);

  const fetchSources = useCallback(async () => {
    if (!tenant) return;
    const supabase = createClient();
    const [newsRes, annRes] = await Promise.all([
      supabase
        .from("news")
        .select("id, title, slug, cover_image, is_published")
        .eq("tenant_id", tenant.id)
        .eq("is_published", true)
        .order("published_at", { ascending: false }),
      supabase
        .from("announcements")
        .select("id, title, slug, cover_image, is_published")
        .eq("tenant_id", tenant.id)
        .eq("is_published", true)
        .order("published_at", { ascending: false }),
    ]);
    setNewsList((newsRes.data as News[]) || []);
    setAnnouncementList((annRes.data as Announcement[]) || []);
  }, [tenant]);

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
    // Yildizli "Haber/Duyuru Sec" alaninin gercek karsiligi: kaynaksiz
    // haber/duyuru manseti public'te tiklanamayan slayt uretirdi.
    if (form.source_type !== "custom" && !form.source_id) {
      toast.error("Lütfen bir haber/duyuru seçin.");
      return;
    }
    if (!tenant) {
      toast.error("Tenant bilgisi yüklenemedi.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      image_url: form.image_url || null,
      link_url: normalizeExternalUrl(form.link_url) || null,
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
      ({ error } = await supabase
        .from("headlines")
        .update(payload)
        .eq("tenant_id", tenant.id)
        .eq("id", editingId));
    } else {
      payload.tenant_id = tenant.id;
      ({ error } = await supabase.from("headlines").insert(payload));
    }

    if (error) {
      toast.error("Kaydetme başarısız oldu.");
    } else {
      // Replace orphan temizligi: eski gorsel + video listeden okunur
      // (youtube_url harici link, storage'da degil — temizlenmez)
      if (editingId) {
        const old = headlines.find((h) => h.id === editingId);
        await cleanupReplacedFile(supabase, old?.image_url, form.image_url || null);
        await cleanupReplacedFile(supabase, old?.video_url, form.video_url || null);
      }
      toast.success(editingId ? "Manşet güncellendi." : "Manşet eklendi.");
      setModalOpen(false);
      fetchHeadlines();
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId || !tenant) return;
    setDeleting(true);

    // Storage path'i DB silmeden ONCE yakala (headlines state'inden)
    const coverPath = storagePathFromUrl(
      headlines.find((h) => h.id === deleteId)?.image_url
    );

    const supabase = createClient();
    const { error } = await supabase
      .from("headlines")
      .delete()
      .eq("tenant_id", tenant.id)
      .eq("id", deleteId);
    if (error) {
      toast.error("Silme başarısız oldu.");
      setDeleting(false);
      return;
    }

    // content_media (defansif — manset'te galeri yoksa bos doner) + storage temizligi
    const galleryPaths = await purgeContentMedia(supabase, tenant.id, "headline", deleteId);
    await removeFilesFromStorage(supabase, "images", [coverPath, ...galleryPaths]);

    toast.success("Manşet silindi.");
    setDeleteId(null);
    fetchHeadlines();
    setDeleting(false);
  };

  const toggleActive = async (h: Headline) => {
    if (!tenant) return;
    const supabase = createClient();
    const { error } = await supabase
      .from("headlines")
      .update({ is_active: !h.is_active })
      .eq("tenant_id", tenant.id)
      .eq("id", h.id);
    if (error) {
      toast.error("Güncelleme başarısız.");
    } else {
      setHeadlines((prev) =>
        prev.map((item) => (item.id === h.id ? { ...item, is_active: !item.is_active } : item))
      );
      // Toggle etkisi aninda — sessiz kalirsa admin emin olamiyor (Tur 3 b1).
      toast.success(h.is_active ? "Pasife alındı — sitede artık görünmez." : "Aktife alındı.");
    }
  };

  // Drag & Drop
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !tenant) return;

    const oldIndex = headlines.findIndex((h) => h.id === active.id);
    const newIndex = headlines.findIndex((h) => h.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(headlines, oldIndex, newIndex);
    setHeadlines(reordered);

    // Persist REORDERED uzerinden (state async): hata kontrolu korunur —
    // kismi basarisizlikta sunucu durumuna geri donulur (fetchHeadlines).
    const supabase = createClient();
    const updates = reordered.map((h, i) =>
      supabase
        .from("headlines")
        .update({ order: i })
        .eq("tenant_id", tenant.id)
        .eq("id", h.id)
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
        <AdminHeader title="Manşet Yönetimi" helpTopic="manset" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title="Manşet Yönetimi" helpTopic="manset" />

      <div className="p-4 lg:p-6">
        {headlines.length >= 10 && (
          <div className="mb-4 rounded-lg bg-warning/10 border border-warning/30 px-4 py-3 text-sm text-warning">
            Maksimum manşet sayısına (10) ulaşıldı.
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-text-muted">
            Anasayfada büyük olarak gösterilen manşetleri yönetin. Sürükleyerek sıralayabilirsiniz.
          </p>
          {headlines.length > 0 && headlines.length < 10 && (
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Yeni Manşet Ekle
            </Button>
          )}
        </div>

        {loadFailed ? (
          <ListLoadError onRetry={fetchHeadlines} />
        ) : headlines.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-text-muted rounded-xl bg-white border border-border">
            <p className="text-lg font-medium mb-1">Henüz manşet eklenmemiş</p>
            <p className="text-sm mb-4">Yeni bir manşet ekleyerek başlayın.</p>
            <Button onClick={openNew}>
              <Plus className="h-4 w-4" />
              Manşet Ekle
            </Button>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={headlines.map((h) => h.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {headlines.map((h) => (
                  <SortableHeadlineRow
                    key={h.id}
                    h={h}
                    onToggle={toggleActive}
                    onEdit={openEdit}
                    onDelete={setDeleteId}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Manşet Düzenle" : "Yeni Manşet Ekle"}
        className="max-w-7xl w-[92vw]"
      >
        <div className="max-h-[70vh] overflow-y-auto -mx-1 px-1">
          <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-10">
            {/* Sol sütun — Metinler ve ayarlar */}
            <div className="space-y-6 min-w-0">
              {/* Kaynak */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Kaynak</p>
                <FormField label="Manşet Türü">
                  <div className="grid grid-cols-3 gap-2">
                    {(["custom", "news", "announcement"] as SourceType[]).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => handleSourceChange(type)}
                        className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                          form.source_type === type
                            ? "border-primary bg-primary/10 text-primary font-medium"
                            : "border-border bg-white text-text-muted hover:bg-bg-light"
                        }`}
                      >
                        {type === "custom" ? "Özel Manşet" : type === "news" ? "Haberden" : "Duyurudan"}
                      </button>
                    ))}
                  </div>
                </FormField>

                {form.source_type !== "custom" && (
                  <FormField
                    label={form.source_type === "news" ? "Haber Seç" : "Duyuru Seç"}
                    required
                  >
                    <Select
                      value={form.source_id}
                      onChange={(e) => handleSourceSelect(e.target.value)}
                    >
                      <option value="">Seçiniz...</option>
                      {(form.source_type === "news" ? newsList : announcementList).map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                )}
              </section>

              {/* Metinler */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Metinler</p>
                <Input
                  id="headline-title"
                  label="Başlık"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder="Manşet başlığı"
                  required
                />
                <Input
                  id="headline-subtitle"
                  label="Alt Başlık"
                  value={form.subtitle}
                  onChange={(e) => setForm((p) => ({ ...p, subtitle: e.target.value }))}
                  placeholder="Opsiyonel alt başlık"
                />
              </section>

              {/* Bağlantı */}
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Bağlantı</p>
                <Input
                  id="headline-link"
                  label="Bağlantı Adresi"
                  value={form.link_url}
                  onChange={(e) => setForm((p) => ({ ...p, link_url: e.target.value }))}
                  placeholder="/haberler/ornek-haber"
                  helperText={
                    form.source_type === "custom"
                      ? "Boş bırakılırsa manşet kendi detay sayfasında açılır."
                      : "Kaynak seçilince otomatik doldurulur."
                  }
                />
              </section>

              {/* İçerik — yalnızca özel manşette */}
              {form.source_type === "custom" && (
                <section className="space-y-3">
                  <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">İçerik</p>
                  <FormField label="Detay İçeriği (opsiyonel)">
                    <RichTextEditor
                      content={form.content}
                      onChange={(html) => setForm((p) => ({ ...p, content: html }))}
                    />
                  </FormField>
                </section>
              )}
            </div>

            {/* Sağ sütun — Medya */}
            <div className="space-y-6 min-w-0">
              <section className="space-y-3">
                <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Manşet Görseli</p>
                <FormField label="Kapak Görseli">
                  <ImageUploader
                    value={form.image_url}
                    onChange={(url) => setForm((p) => ({ ...p, image_url: url }))}
                    folder="headlines"
                    maxWidth={1400}
                    maxHeight={600}
                  />
                </FormField>
                <p className="text-xs text-text-muted">
                  Önerilen boyut: 1400 × 600 piksel.
                </p>
              </section>

              {/* Ek Medya — yalnızca özel manşette */}
              {form.source_type === "custom" && (
                <section className="space-y-3">
                  <p className="text-xs uppercase tracking-wider text-text-muted font-semibold">Ek Medya</p>
                  <MediaUploader
                    value={form.video_url}
                    onChange={(url) => setForm((p) => ({ ...p, video_url: url }))}
                    youtubeUrl={form.youtube_url}
                    onYoutubeChange={(url) => setForm((p) => ({ ...p, youtube_url: url }))}
                    folder="headlines/videos"
                  />
                </section>
              )}

              <p className="text-xs text-text-muted pt-2">
                Sıralama liste sayfasında sürükle-bırak ile yapılır.
              </p>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-5 mt-6 border-t border-border">
          <Button variant="secondary" onClick={() => setModalOpen(false)}>
            İptal
          </Button>
          <Button onClick={handleSave} loading={saving}>
            {editingId ? "Değişiklikleri Kaydet" : "Manşet Ekle"}
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
