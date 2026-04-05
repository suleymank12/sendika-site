import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/public/Breadcrumb";
import GalleryGrid from "@/components/public/GalleryGrid";
import type { Metadata } from "next";

interface Props {
  params: { albumId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const { data } = await supabase
    .from("gallery_albums")
    .select("title")
    .eq("id", params.albumId)
    .eq("is_published", true)
    .single();

  return { title: data?.title || "Galeri Albümü" };
}

export default async function GalleryAlbumPage({ params }: Props) {
  const supabase = createClient();

  const { data: album } = await supabase
    .from("gallery_albums")
    .select("*")
    .eq("id", params.albumId)
    .eq("is_published", true)
    .single();

  if (!album) notFound();

  const { data: images } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("album_id", params.albumId)
    .order("order", { ascending: true });

  return (
    <>
      <Breadcrumb
        items={[
          { label: "Galeri", href: "/galeri" },
          { label: album.title },
        ]}
      />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">{album.title}</h1>
        {(images || []).length === 0 ? (
          <p className="text-text-muted">Bu albümde henüz fotoğraf bulunmuyor.</p>
        ) : (
          <GalleryGrid images={images || []} />
        )}
      </div>
    </>
  );
}
