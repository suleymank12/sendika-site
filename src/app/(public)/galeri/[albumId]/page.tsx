import { createClient } from "@/lib/supabase/server";
import { getCurrentTenant } from "@/lib/get-tenant";
import { notFound } from "next/navigation";
import Breadcrumb from "@/components/public/Breadcrumb";
import GalleryGrid from "@/components/public/GalleryGrid";
import { buildPublicMetadata } from "@/lib/seo";
import type { Metadata } from "next";

interface Props {
  params: { albumId: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createClient();
  const tenant = await getCurrentTenant();
  const { data } = await supabase
    .from("gallery_albums")
    .select("title, cover_image, gallery_images(count)")
    .eq("tenant_id", tenant.id)
    .eq("id", params.albumId)
    .eq("is_published", true)
    .single();

  if (!data) return { title: "Galeri Albümü" };

  const imageCount: number = data.gallery_images?.[0]?.count || 0;

  return buildPublicMetadata({
    path: `/galeri/${params.albumId}`,
    title: data.title,
    description:
      imageCount > 0
        ? `${data.title} albümü — ${imageCount} fotoğraf`
        : `${data.title} fotoğraf albümü`,
    image: data.cover_image,
  });
}

export default async function GalleryAlbumPage({ params }: Props) {
  const supabase = createClient();
  const tenant = await getCurrentTenant();

  const { data: album } = await supabase
    .from("gallery_albums")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("id", params.albumId)
    .eq("is_published", true)
    .single();

  if (!album) notFound();

  const { data: images } = await supabase
    .from("gallery_images")
    .select("*")
    .eq("tenant_id", tenant.id)
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
