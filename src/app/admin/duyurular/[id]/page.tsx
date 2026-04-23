"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import FormField from "@/components/admin/FormField";
import MediaSection from "@/components/admin/MediaSection";
import RichTextEditor from "@/components/admin/RichTextEditor";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import { createSlug } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import toast from "react-hot-toast";

export default function AdminAnnouncementEditorPage() {
  const params = useParams();
  const router = useRouter();
  const isNew = params.id === "yeni";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [isHeadline, setIsHeadline] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [initialGallery, setInitialGallery] = useState<string[]>([]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [existingPublishedAt, setExistingPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew) {
      const fetchData = async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("announcements")
          .select("*")
          .eq("id", params.id)
          .single();

        if (error || !data) {
          toast.error("Duyuru bulunamadı.");
          router.push("/admin/duyurular");
          return;
        }

        setTitle(data.title);
        setSlug(data.slug);
        setSummary(data.summary || "");
        setContent(data.content || "");
        setCoverImage(data.cover_image || "");
        setIsHeadline(data.is_headline || false);
        setVideoUrl(data.video_url || "");
        setYoutubeUrl(data.youtube_url || "");
        setExistingPublishedAt(data.published_at || null);

        const { data: mediaData } = await supabase
          .from("content_media")
          .select("url")
          .eq("content_type", "announcement")
          .eq("content_id", params.id)
          .eq("media_type", "image")
          .order("order", { ascending: true });

        const urls = (mediaData || []).map((m) => m.url as string);
        setGalleryImages(urls);
        setInitialGallery(urls);

        setSlugManuallyEdited(true);
        setLoading(false);
      };
      fetchData();
    }
  }, [isNew, params.id, router]);

  useEffect(() => {
    if (!slugManuallyEdited && title) {
      setSlug(createSlug(title));
    }
  }, [title, slugManuallyEdited]);

  const handleSave = async (publish: boolean) => {
    if (!title.trim()) {
      toast.error("Başlık alanı zorunludur.");
      return;
    }

    if (!slug.trim()) {
      toast.error("Slug alanı zorunludur.");
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const payload: Record<string, unknown> = {
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim() || null,
      content: content || null,
      cover_image: coverImage || null,
      video_url: videoUrl || null,
      youtube_url: youtubeUrl || null,
      is_published: publish,
      is_headline: isHeadline,
      updated_at: new Date().toISOString(),
    };

    // Yayın tarihi sadece ilk yayınlamada atanır, sonra korunur
    if (isNew) {
      payload.published_at = publish ? new Date().toISOString() : null;
    } else if (publish && !existingPublishedAt) {
      payload.published_at = new Date().toISOString();
    }
    // Aksi halde published_at payload'a eklenmez ve veritabanındaki eski değer korunur

    let error;
    let annId = params.id as string;

    if (isNew) {
      const res = await supabase.from("announcements").insert(payload).select("id").single();
      error = res.error;
      if (res.data) annId = res.data.id;
    } else {
      ({ error } = await supabase.from("announcements").update(payload).eq("id", params.id));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme işlemi başarısız oldu.");
      }
    } else {
      // Galeri görsellerini senkronize et
      const removed = initialGallery.filter((u) => !galleryImages.includes(u));
      if (removed.length > 0) {
        await supabase
          .from("content_media")
          .delete()
          .eq("content_type", "announcement")
          .eq("content_id", annId)
          .in("url", removed);
      }

      const added = galleryImages.filter((u) => !initialGallery.includes(u));
      if (added.length > 0) {
        const rows = added.map((url) => ({
          content_type: "announcement",
          content_id: annId,
          media_type: "image",
          url,
          order: galleryImages.indexOf(url),
        }));
        await supabase.from("content_media").insert(rows);
      }

      const kept = galleryImages.filter((u) => initialGallery.includes(u));
      for (const url of kept) {
        await supabase
          .from("content_media")
          .update({ order: galleryImages.indexOf(url) })
          .eq("content_type", "announcement")
          .eq("content_id", annId)
          .eq("url", url);
      }

      // Manşete ekle/çıkar
      if (isHeadline && publish) {
        const { data: existing } = await supabase
          .from("headlines")
          .select("id")
          .eq("source_type", "announcement")
          .eq("source_id", annId)
          .maybeSingle();

        if (!existing) {
          await supabase.from("headlines").insert({
            title: title.trim(),
            image_url: coverImage || null,
            link_url: `/duyurular/${slug.trim()}`,
            source_type: "announcement",
            source_id: annId,
            is_active: true,
          });
        }
      } else if (!isHeadline) {
        await supabase
          .from("headlines")
          .delete()
          .eq("source_type", "announcement")
          .eq("source_id", annId);
      }

      toast.success(publish ? "Duyuru yayınlandı." : "Taslak kaydedildi.");
      router.push("/admin/duyurular");
    }

    setSaving(false);
  };

  const breadcrumbs = [
    { label: "Duyurular", href: "/admin/duyurular" },
    { label: isNew ? "Yeni Duyuru" : "Düzenle" },
  ];

  if (loading) {
    return (
      <>
        <AdminHeader title="Duyuru Düzenle" breadcrumbs={breadcrumbs} />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title={isNew ? "Yeni Duyuru" : title || "Duyuru Düzenle"}
        breadcrumbs={breadcrumbs}
      />
      <div className="p-4 lg:p-6 max-w-7xl mx-auto pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(340px,400px)] gap-8 lg:gap-6">
          {/* Sol sütun */}
          <div className="space-y-8 min-w-0">
            {/* Temel Bilgiler */}
            <section>
              <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
                Temel Bilgiler
              </p>
              <div className="rounded-xl bg-white border border-border p-5 lg:p-6 space-y-4">
                <Input
                  id="title"
                  label="Başlık"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Duyuru başlığını girin"
                  required
                />
                <Input
                  id="slug"
                  label="URL Kısa Adı"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value);
                    setSlugManuallyEdited(true);
                  }}
                  helperText="Başlıktan otomatik oluşur. Duyurunun adresi: /duyurular/bu-ad"
                />
              </div>
            </section>

            {/* İçerik */}
            <section>
              <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
                İçerik
              </p>
              <div className="rounded-xl bg-white border border-border p-5 lg:p-6 space-y-5">
                <FormField label="Özet">
                  <textarea
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    rows={3}
                    placeholder="Duyurunun kısa özeti..."
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                  />
                </FormField>
                <FormField label="İçerik">
                  <RichTextEditor content={content} onChange={setContent} />
                </FormField>
              </div>
            </section>
          </div>

          {/* Sağ sütun — Medya */}
          <aside className="min-w-0">
            <section>
              <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
                Medya
              </p>
              <MediaSection
                folder="announcements"
                coverImage={coverImage}
                onCoverImageChange={setCoverImage}
                videoUrl={videoUrl}
                onVideoChange={setVideoUrl}
                youtubeUrl={youtubeUrl}
                onYoutubeChange={setYoutubeUrl}
                contentType="announcement"
                contentId={isNew ? null : (params.id as string)}
                galleryImages={galleryImages}
                onGalleryChange={setGalleryImages}
              />
            </section>
          </aside>
        </div>
      </div>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-white px-4 lg:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between shadow-[0_-2px_8px_rgba(0,0,0,0.03)]">
        <label className="flex items-center gap-2 cursor-pointer group relative">
          <input
            type="checkbox"
            checked={isHeadline}
            onChange={(e) => setIsHeadline(e.target.checked)}
            className="rounded border-border text-primary focus:ring-primary/50 h-4 w-4"
          />
          <span className="text-sm font-medium text-text-dark">Manşete Ekle</span>
          <HelpCircle className="h-3.5 w-3.5 text-text-muted" />
          <span className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 rounded-lg bg-text-dark text-white text-xs p-2.5 shadow-lg z-30 pointer-events-none">
            İşaretlersen anasayfadaki manşet slider&apos;ında büyük olarak görünür.
          </span>
        </label>
        <div className="flex gap-3 w-full sm:w-auto">
          <div className="relative group flex-1 sm:flex-none">
            <Button variant="secondary" onClick={() => handleSave(false)} loading={saving} className="w-full">
              Taslak Kaydet
            </Button>
            <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-56 rounded-lg bg-text-dark text-white text-xs p-2.5 shadow-lg z-30 pointer-events-none">
              Sadece sen görürsün, site ziyaretçilerine gözükmez.
            </span>
          </div>
          <div className="relative group flex-1 sm:flex-none">
            <Button onClick={() => handleSave(true)} loading={saving} className="w-full">
              Yayınla
            </Button>
            <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-56 rounded-lg bg-text-dark text-white text-xs p-2.5 shadow-lg z-30 pointer-events-none">
              Site ziyaretçilerine hemen açık olur.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
