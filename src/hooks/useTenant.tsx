"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tenant } from "@/lib/tenant";
import { planTenantQuery, needsClientResolve } from "@/lib/tenant-hostname";

interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
});

/**
 * TENANT KAYNAGI — TEK YOL: initialTenant.
 *
 * Sunucu tarafi zinciri: middleware (custom_domain DB lookup)
 *   -> x-tenant-slug header -> getCurrentTenant() -> admin layout
 *   -> AdminShell -> buraya initialTenant olarak iner.
 *
 * NEDEN BOYLE (canli bug, 8 Eylul 2026):
 *   Once tenant IKI AYRI YOLDAN cozuluyordu — sunucu header'dan (dogru),
 *   istemci hostname'den (custom_domain'i cozemez). Custom domain uzerinden
 *   admin panelinde sunucu "Kurmay Teknoloji" derken istemci "default"
 *   diyordu; panelin tamami (sidebar, sayaclar, 19 sayfa, ImageUploader)
 *   istemcinin degerini kullandigi icin BASKA TENANT'IN verisi gosteriliyordu.
 *   Cozum: istemci artik ayni isi tekrar YAPMAZ.
 *
 * initialTenant verildiginde:
 *   - istemci sorgusu HIC atilmaz,
 *   - loading HIC true olmaz (loading flash yok).
 *
 * Asagidaki fallback yalnizca initialTenant VERILMEYEN kullanim icin durur
 * (bugun boyle bir cagiran yok; ileride public tarafta kullanilirsa diye).
 */
export function TenantProvider({
  children,
  initialTenant,
}: {
  children: React.ReactNode;
  initialTenant?: Tenant | null;
}) {
  const [tenant, setTenant] = useState<Tenant | null>(initialTenant ?? null);
  // HATA STATE'I: loading false + tenant null. Ayri bir bayrak tutulmuyor —
  // 19 admin sayfasi zaten `if (!tenant) return` deseniyle calisiyor.
  const [loading, setLoading] = useState(needsClientResolve(initialTenant));

  useEffect(() => {
    // Sunucu zaten cozdu → sorgu YOK, state zaten dolu.
    if (!needsClientResolve(initialTenant)) return;

    let cancelled = false;

    const fetchTenant = async () => {
      const supabase = createClient();

      // TEK sorgu. Fallback zinciri BILEREK yok: bulunamayan host'ta
      // default'a dusmek, bu bug'in mekanizmasiydi.
      const plan = planTenantQuery(window.location.hostname);
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq(plan.by, plan.value)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("[TenantProvider] tenant sorgusu hatasi:", error);
      }

      // Bulunamadiysa null KALIR — default'a DUSULMEZ (fail-safe).
      setTenant((data as Tenant | null) ?? null);
      setLoading(false);
    };

    fetchTenant();

    return () => {
      cancelled = true;
    };
  }, [initialTenant]);

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
