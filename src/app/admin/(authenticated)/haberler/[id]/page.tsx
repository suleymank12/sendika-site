"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  storagePathFromUrl,
  removeFilesFromStorage,
  cleanupReplacedFile,
} from "@/lib/storage";
import { useTenant } from "@/hooks/useTenant";
import AdminHeader from "@/components/admin/AdminHeader";
import FormField from "@/components/admin/FormField";
import MediaSection from "@/components/admin/MediaSection";
import RichTextEditor from "@/components/admin/RichTextEditor";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Loading from "@/components/ui/Loading";
import { createSlug } from "@/lib/utils";
import { HelpCircle } from "lucide-react";
import { NewsCategory } from "@/types";
import toast from "react-hot-toast";

export default function AdminNewsEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { tenant } = useTenant();
  const isNew = params.id === "yeni";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [category, setCategory] = useState("");
  const [isHeadline, setIsHeadline] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [galleryImages, setGalleryImages] = useState<string[]>([]);
  const [initialGallery, setInitialGallery] = useState<string[]>([]);
  // Replace orphan temizligi icin DB'den okunan ilk degerlerin snapshot'i
  const [initialCoverImage, setInitialCoverImage] = useState<string | null>(null);
  const [initialVideoUrl, setInitialVideoUrl] = useState<string | null>(null);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [categories, setCategories] = useState<NewsCategory[]>([]);
  const [existingPublishedAt, setExistingPublishedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!tenant) return;
    const fetchCategories = async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from("news_categories")
        .select("*")
        .eq("tenant_id", tenant.id)
        .eq("is_active", true)
        .order("order", { ascending: true });
      setCategories(data || []);
    };
    fetchCategories();
  }, [tenant]);

  useEffect(() => {
    if (!isNew && tenant) {
      const fetchNews = async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("news")
          .select("*")
          .eq("tenant_id", tenant.id)
          .eq("id", params.id)
          .single();

        if (error || !data) {
          toast.error("Haber bulunamadı.");
          router.push("/admin/haberler");
          return;
        }

        setTitle(data.title);
        setSlug(data.slug);
        setSummary(data.summary || "");
        setContent(data.content || "");
        setCoverImage(data.cover_image || "");
        setInitialCoverImage(data.cover_image || null);
        setCategory(data.category || "");
        setIsHeadline(data.is_headline || false);
        setVideoUrl(data.video_url || "");
        setInitialVideoUrl(data.video_url || null);
        setYoutubeUrl(data.youtube_url || "");
        setExistingPublishedAt(data.published_at || null);

        const { data: mediaData } = await supabase
          .from("content_media")
          .select("url")
          .eq("tenant_id", tenant.id)
          .eq("content_type", "news")
          .eq("content_id", params.id)
          .eq("media_type", "image")
          .order("order", { ascending: true });

        const urls = (mediaData || []).map((m) => m.url as string);
        setGalleryImages(urls);
        setInitialGallery(urls);

        setSlugManuallyEdited(true);
        setLoading(false);
      };
      fetchNews();
    }
  }, [isNew, params.id, router, tenant]);

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

    if (!tenant) {
      toast.error("Tenant bilgisi yüklenemedi.");
      return;
    }

    setSaving(true);

    const supabase = createClient();
    const payload: Record<string, unknown> = {
      tenant_id: tenant.id,
      title: title.trim(),
      slug: slug.trim(),
      summary: summary.trim() || null,
      content: content || null,
      cover_image: coverImage || null,
      video_url: videoUrl || null,
      youtube_url: youtubeUrl || null,
      category: category.trim() || null,
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
    let newsId = params.id as string;

    if (isNew) {
      const res = await supabase.from("news").insert(payload).select("id").single();
      error = res.error;
      if (res.data) newsId = res.data.id;
    } else {
      ({ error } = await supabase
        .from("news")
        .update(payload)
        .eq("tenant_id", tenant.id)
        .eq("id", params.id));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme işlemi başarısız oldu.");
      }
    } else {
      // Replace orphan temizligi: degisen cover/video eski dosyalari (best-effort).
      // youtube_url harici link oldugundan temizlenmez. isNew'de snapshot null -> no-op.
      await cleanupReplacedFile(supabase, initialCoverImage, coverImage || null);
      await cleanupReplacedFile(supabase, initialVideoUrl, videoUrl || null);

      // Galeri görsellerini senkronize et
      const removed = initialGallery.filter((u) => !galleryImages.includes(u));
      if (removed.length > 0) {
        await supabase
          .from("content_media")
          .delete()
          .eq("tenant_id", tenant.id)
          .eq("content_type", "news")
          .eq("content_id", newsId)
          .in("url", removed);

        // Cikartilan galeri fotograflarini storage'tan da temizle (best-effort)
        await removeFilesFromStorage(
          supabase,
          "images",
          removed.map((url) => storagePathFromUrl(url))
        );
      }

      const added = galleryImages.filter((u) => !initialGallery.includes(u));
      if (added.length > 0) {
        const rows = added.map((url) => ({
          tenant_id: tenant.id,
          content_type: "news",
          content_id: newsId,
          media_type: "image",
          url,
          order: galleryImages.indexOf(url),
        }));
        await supabase.from("content_media").insert(rows);
      }

      // Sıralama güncellemesi (mevcut kayıtlar için)
      const kept = galleryImages.filter((u) => initialGallery.includes(u));
      for (const url of kept) {
        await supabase
          .from("content_media")
          .update({ order: galleryImages.indexOf(url) })
          .eq("tenant_id", tenant.id)
          .eq("content_type", "news")
          .eq("content_id", newsId)
          .eq("url", url);
      }

      // Manşete ekle/çıkar
      if (isHeadline && publish) {
        const { data: existing } = await supabase
          .from("headlines")
          .select("id")
          .eq("tenant_id", tenant.id)
          .eq("source_type", "news")
          .eq("source_id", newsId)
          .maybeSingle();

        if (!existing) {
          await supabase.from("headlines").insert({
            tenant_id: tenant.id,
            title: title.trim(),
            image_url: coverImage || null,
            link_url: `/haberler/${slug.trim()}`,
            source_type: "news",
            source_id: newsId,
            is_active: true,
          });
        }
      } else if (!isHeadline) {
        await supabase
          .from("headlines")
          .delete()
          .eq("tenant_id", tenant.id)
          .eq("source_type", "news")
          .eq("source_id", newsId);
      }

      toast.success(publish ? "Haber yayınlandı." : "Taslak kaydedildi.");
      router.push("/admin/haberler");
    }

    setSaving(false);
  };

  const breadcrumbs = [
    { label: "Haberler", href: "/admin/haberler" },
    { label: isNew ? "Yeni Haber" : "Düzenle" },
  ];

  if (loading) {
    return (
      <>
        <AdminHeader title="Haber Düzenle" breadcrumbs={breadcrumbs} />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader
        title={isNew ? "Yeni Haber" : title || "Haber Düzenle"}
        breadcrumbs={breadcrumbs}
      />
      <div className="p-4 lg:p-6 max-w-7xl mx-auto pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(340px,400px)] gap-8 lg:gap-6">
          {/* Sol sütun — Yazı ağırlıklı */}
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
                  placeholder="Haber başlığını girin"
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
                  helperText="Başlıktan otomatik oluşur. Haberin adresi: /haberler/bu-ad"
                />
                <div>
                  <Select
                    id="news-category"
                    label="Kategori"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="">Seçiniz</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    {category && !categories.some((c) => c.name === category) && (
                      <option value={category}>{category} (pasif)</option>
                    )}
                  </Select>
                  {categories.length === 0 && (
                    <p className="text-xs text-text-muted mt-1">
                      {/* Link (client-side gecis) sart: <a href> tam sayfa
                          yenileme yapip yazilmakta olan haberi kaybettiriyordu */}
                      Henüz kategori yok. <Link href="/admin/kategoriler" className="text-primary hover:underline">Kategoriler sayfasından</Link> ekleyebilirsin.
                    </p>
                  )}
                </div>
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
                    placeholder="Haberin kısa özeti..."
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
                folder="news"
                coverImage={coverImage}
                onCoverImageChange={setCoverImage}
                videoUrl={videoUrl}
                onVideoChange={setVideoUrl}
                youtubeUrl={youtubeUrl}
                onYoutubeChange={setYoutubeUrl}
                contentType="news"
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
