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
import toast from "react-hot-toast";

export default function AdminPageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const isNew = params.id === "yeni";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [initialGallery, setInitialGallery] = useState<string[]>([]);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (!isNew) {
      const fetchPage = async () => {
        const supabase = createClient();
        const { data, error } = await supabase.from("pages").select("*").eq("id", params.id).single();
        if (error || !data) {
          toast.error("Sayfa bulunamadı.");
          router.push("/admin/sayfalar");
          return;
        }
        setTitle(data.title);
        setSlug(data.slug);
        setContent(data.content || "");
        setCoverImage(data.cover_image || "");
        setVideoUrl(data.video_url || "");
        setYoutubeUrl(data.youtube_url || "");

        const { data: mediaData } = await supabase
          .from("content_media")
          .select("url")
          .eq("content_type", "page")
          .eq("content_id", params.id)
          .eq("media_type", "image")
          .order("order", { ascending: true });

        const urls = (mediaData || []).map((m) => m.url as string);
        setGalleryImages(urls);
        setInitialGallery(urls);

        setSlugManuallyEdited(true);
        setLoading(false);
      };
      fetchPage();
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
    const payload = {
      title: title.trim(),
      slug: slug.trim(),
      content: content || null,
      cover_image: coverImage || null,
      video_url: videoUrl || null,
      youtube_url: youtubeUrl || null,
      is_published: publish,
      updated_at: new Date().toISOString(),
    };

    let error;
    let pageId = params.id as string;
    if (isNew) {
      const res = await supabase.from("pages").insert(payload).select("id").single();
      error = res.error;
      if (res.data) pageId = res.data.id;
    } else {
      ({ error } = await supabase.from("pages").update(payload).eq("id", params.id));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("Bu slug zaten kullanılıyor.");
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
          .eq("content_type", "page")
          .eq("content_id", pageId)
          .in("url", removed);
      }

      const added = galleryImages.filter((u) => !initialGallery.includes(u));
      if (added.length > 0) {
        const rows = added.map((url) => ({
          content_type: "page",
          content_id: pageId,
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
          .eq("content_type", "page")
          .eq("content_id", pageId)
          .eq("url", url);
      }

      toast.success(publish ? "Sayfa yayınlandı." : "Taslak kaydedildi.");
      router.push("/admin/sayfalar");
    }
    setSaving(false);
  };

  const breadcrumbs = [
    { label: "Sayfalar", href: "/admin/sayfalar" },
    { label: isNew ? "Yeni Sayfa" : "Düzenle" },
  ];

  if (loading) {
    return (
      <>
        <AdminHeader title="Sayfa Düzenle" breadcrumbs={breadcrumbs} />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title={isNew ? "Yeni Sayfa" : title || "Sayfa Düzenle"}
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
                  placeholder="Sayfa başlığını girin"
                  required
                />
                <Input
                  id="slug"
                  label="URL Kısa Adı"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugManuallyEdited(true); }}
                  helperText="Başlıktan otomatik oluşur. Sayfanın adresi: /sayfa/bu-ad"
                />
              </div>
            </section>

            {/* İçerik */}
            <section>
              <p className="text-xs uppercase tracking-wider text-text-muted font-semibold mb-3">
                İçerik
              </p>
              <div className="rounded-xl bg-white border border-border p-5 lg:p-6">
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
                folder="pages"
                coverImage={coverImage}
                onCoverImageChange={setCoverImage}
                videoUrl={videoUrl}
                onVideoChange={setVideoUrl}
                youtubeUrl={youtubeUrl}
                onYoutubeChange={setYoutubeUrl}
                contentType="page"
                contentId={isNew ? null : (params.id as string)}
                galleryImages={galleryImages}
                onGalleryChange={setGalleryImages}
              />
            </section>
          </aside>
        </div>
      </div>

      {/* Sticky Save Bar */}
      <div className="sticky bottom-0 z-20 border-t border-border bg-white px-4 lg:px-6 py-3 flex flex-col sm:flex-row gap-3 justify-end shadow-[0_-2px_8px_rgba(0,0,0,0.03)]">
        <div className="relative group">
          <Button variant="secondary" onClick={() => handleSave(false)} loading={saving} className="w-full sm:w-auto">
            Taslak Kaydet
          </Button>
          <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-56 rounded-lg bg-text-dark text-white text-xs p-2.5 shadow-lg z-30 pointer-events-none">
            Sadece sen görürsün, site ziyaretçilerine gözükmez.
          </span>
        </div>
        <div className="relative group">
          <Button onClick={() => handleSave(true)} loading={saving} className="w-full sm:w-auto">
            Yayınla
          </Button>
          <span className="absolute bottom-full right-0 mb-2 hidden group-hover:block w-56 rounded-lg bg-text-dark text-white text-xs p-2.5 shadow-lg z-30 pointer-events-none">
            Site ziyaretçilerine hemen açık olur.
          </span>
        </div>
      </div>
    </>
  );
}
