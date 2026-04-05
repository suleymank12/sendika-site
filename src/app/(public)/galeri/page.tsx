import { createClient } from "@/lib/supabase/server";
import Breadcrumb from "@/components/public/Breadcrumb";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import { GalleryAlbum } from "@/types";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fotoğraf Galerisi",
  description: "Etkinlik ve organizasyon fotoğrafları",
};

export default async function GalleryPage() {
  const supabase = createClient();
  const { data: albums } = await supabase
    .from("gallery_albums")
    .select("*, gallery_images(count)")
    .eq("is_published", true)
    .order("order", { ascending: true });

  interface AlbumWithCount extends GalleryAlbum {
    gallery_images: { count: number }[];
  }

  const albumList = ((albums || []) as AlbumWithCount[]).map((album) => ({
    ...album,
    image_count: album.gallery_images?.[0]?.count || 0,
  }));

  return (
    <>
      <Breadcrumb items={[{ label: "Galeri" }]} />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-text-dark tracking-tight mb-8">Fotoğraf Galerisi</h1>

        {albumList.length === 0 ? (
          <p className="text-text-muted">Henüz galeri albümü bulunmuyor.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {albumList.map((album) => (
              <Link
                key={album.id}
                href={`/galeri/${album.id}`}
                className="group rounded-xl border border-border bg-white overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="relative h-52 bg-bg-light overflow-hidden">
                  {album.cover_image ? (
                    <img
                      src={album.cover_image}
                      alt={album.title}
                      className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <ImageIcon className="h-12 w-12 text-text-muted/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold">{album.title}</h3>
                    <p className="text-white/70 text-sm mt-0.5">{album.image_count} fotoğraf</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
