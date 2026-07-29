"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";

// Modul-seviyesi in-flight/sonuc cache'i: Sidebar (layout) + dashboard ayni
// anda mount oldugunda ayni site_title sorgusu 2 kez atiliyordu; artik ayni
// Promise'i paylasiyorlar. Client-side navigasyonlar boyunca yasar — Sidebar
// layout'ta zaten remount olmadigi icin gorunur davranis degismedi (baslik
// degisikligi eskiden de tam sayfa yenilemeyle yansiyordu).
const titleCache = new Map<string, Promise<string | null>>();

export function useSiteTitle(fallback = "Sendika Adı") {
  const [title, setTitle] = useState(fallback);
  const { tenant } = useTenant();

  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;

    let promise = titleCache.get(tenant.id);
    if (!promise) {
      const supabase = createClient();
      // Promise.resolve: supabase builder'i thenable dondurur (PromiseLike),
      // Map'te gercek Promise tutuyoruz.
      promise = Promise.resolve(
        supabase
          .from("site_settings")
          .select("value")
          .eq("tenant_id", tenant.id)
          .eq("key", "site_title")
          .maybeSingle()
      ).then(
          ({ data }) => (data?.value as string) ?? null,
          () => {
            // Ag hatasinda cache'e kalici rejection birakma — sonraki
            // mount yeniden denesin.
            titleCache.delete(tenant.id);
            return null;
          }
        );
      titleCache.set(tenant.id, promise);
    }

    promise.then((value) => {
      if (cancelled) return;
      if (value) setTitle(value);
      else if (tenant.name) setTitle(tenant.name);
    });

    return () => {
      cancelled = true;
    };
  }, [tenant]);

  return title;
}
