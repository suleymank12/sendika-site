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
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

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
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

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

  if (loading) {
    return (
      <>
        <AdminHeader title="Duyuru Düzenle" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title={isNew ? "Yeni Duyuru" : "Duyuru Düzenle"} />
      <div className="p-4 lg:p-6 max-w-4xl">
        <Link
          href="/admin/duyurular"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Duyurulara Dön
        </Link>

        <div className="space-y-6">
          {/* Title + Slug */}
          <div className="rounded-xl bg-white border border-border p-5 space-y-4">
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
              label="Slug (URL)"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              helperText="/duyurular/slug-buraya-gelecek"
            />
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-white border border-border p-5">
            <FormField label="Özet">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="Duyurunun kısa özeti..."
                className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </FormField>
          </div>

          {/* Content */}
          <div className="rounded-xl bg-white border border-border p-5">
            <FormField label="İçerik">
              <RichTextEditor content={content} onChange={setContent} />
            </FormField>
          </div>

          {/* Medya */}
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

          {/* Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 justify-between">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isHeadline}
                onChange={(e) => setIsHeadline(e.target.checked)}
                className="rounded border-border text-primary focus:ring-primary/50 h-4 w-4"
              />
              <span className="text-sm font-medium text-text-dark">Manşete Ekle</span>
            </label>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => handleSave(false)} loading={saving}>
                Taslak Kaydet
              </Button>
              <Button onClick={() => handleSave(true)} loading={saving}>
                Yayınla
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
