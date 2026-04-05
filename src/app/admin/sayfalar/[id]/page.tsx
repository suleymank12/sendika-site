"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AdminHeader from "@/components/admin/AdminHeader";
import FormField from "@/components/admin/FormField";
import RichTextEditor from "@/components/admin/RichTextEditor";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Loading from "@/components/ui/Loading";
import { createSlug } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import toast from "react-hot-toast";
import Link from "next/link";

export default function AdminPageEditorPage() {
  const params = useParams();
  const router = useRouter();
  const isNew = params.id === "yeni";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [content, setContent] = useState("");
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
      is_published: publish,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (isNew) {
      ({ error } = await supabase.from("pages").insert(payload));
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
      toast.success(publish ? "Sayfa yayınlandı." : "Taslak kaydedildi.");
      router.push("/admin/sayfalar");
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <>
        <AdminHeader title="Sayfa Düzenle" />
        <div className="flex items-center justify-center h-64">
          <Loading text="Yükleniyor..." />
        </div>
      </>
    );
  }

  return (
    <>
      <AdminHeader title={isNew ? "Yeni Sayfa" : "Sayfa Düzenle"} />
      <div className="p-4 lg:p-6 max-w-4xl">
        <Link href="/admin/sayfalar" className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-primary mb-4">
          <ArrowLeft className="h-4 w-4" />
          Sayfalara Dön
        </Link>

        <div className="space-y-6">
          <div className="rounded-xl bg-white border border-border p-5 space-y-4">
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
              label="Slug (URL)"
              value={slug}
              onChange={(e) => { setSlug(e.target.value); setSlugManuallyEdited(true); }}
              helperText="/sayfa/slug-buraya-gelecek"
            />
          </div>

          <div className="rounded-xl bg-white border border-border p-5">
            <FormField label="İçerik">
              <RichTextEditor content={content} onChange={setContent} />
            </FormField>
          </div>

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
