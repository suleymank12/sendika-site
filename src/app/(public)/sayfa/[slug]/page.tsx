import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/public/Breadcrumb";
import type { Metadata } from "next";

interface Props {
  params: { slug: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("pages")
    .select("title")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  return { title: data?.title || "Sayfa" };
}

export default async function DynamicPage({ params }: Props) {
  const supabase = createClient();
  const { data: page } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", params.slug)
    .eq("is_published", true)
    .single();

  if (!page) notFound();

  return (
    <>
      <Breadcrumb items={[{ label: page.title }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">{page.title}</h1>
        {page.content ? (
          <div className="prose prose-lg max-w-none text-text-dark" dangerouslySetInnerHTML={{ __html: page.content }} />
        ) : (
          <p className="text-text-muted">Bu sayfada henüz içerik bulunmuyor.</p>
        )}
      </div>
    </>
  );
}
