"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import FormField from "@/components/admin/FormField";
import ImageUploader from "@/components/admin/ImageUploader";
import RichTextEditor from "@/components/admin/RichTextEditor";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import { createSlug } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

export default function AdminNewsEditorPage() {
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
  const [category, setCategory] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  useEffect(() => {
    if (!isNew) {
      const fetchNews = async () => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("news")
          .select("*")
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
        setCategory(data.category || "");
        setSlugManuallyEdited(true);
        setLoading(false);
      };
      fetchNews();
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
      summary: summary.trim() || null,
      content: content || null,
      cover_image: coverImage || null,
      category: category.trim() || null,
      is_published: publish,
      published_at: publish ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    let error;

    if (isNew) {
      ({ error } = await supabase.from("news").insert(payload));
    } else {
      ({ error } = await supabase.from("news").update(payload).eq("id", params.id));
    }

    if (error) {
      if (error.code === "23505") {
        toast.error("Bu slug zaten kullanılıyor. Farklı bir slug deneyin.");
      } else {
        toast.error("Kaydetme işlemi başarısız oldu.");
      }
    } else {
      toast.success(publish ? "Haber yayınlandı." : "Taslak kaydedildi.");
      router.push("/admin/haberler");
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <>
        <AdminHeader title="Haber Düzenle" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title={isNew ? "Yeni Haber" : "Haber Düzenle"} />
      <div className="p-4 lg:p-6 max-w-4xl">
        <Link
          href="/admin/haberler"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Haberlere Dön
        </Link>

        <div className="space-y-6">
          {/* Title + Slug */}
          <div className="rounded-xl bg-white border border-border p-5 space-y-4">
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
              label="Slug (URL)"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugManuallyEdited(true);
              }}
              helperText="/haberler/slug-buraya-gelecek"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-text-dark mb-1">Kategori</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Seçiniz</option>
                  <option value="Genel">Genel</option>
                  <option value="Toplu Sözleşme">Toplu Sözleşme</option>
                  <option value="Eğitim">Eğitim</option>
                  <option value="Basından">Basından</option>
                </select>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="rounded-xl bg-white border border-border p-5">
            <FormField label="Özet">
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                rows={3}
                placeholder="Haberin kısa özeti..."
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

          {/* Cover Image */}
          <div className="rounded-xl bg-white border border-border p-5">
            <FormField label="Kapak Görseli">
              <ImageUploader value={coverImage} onChange={setCoverImage} folder="news" maxWidth={1200} maxHeight={675} />
            </FormField>
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="secondary" onClick={() => handleSave(false)} loading={saving}>
              Taslak Kaydet
            </Button>
            <Button onClick={() => handleSave(true)} loading={saving}>
              Yayınla
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
