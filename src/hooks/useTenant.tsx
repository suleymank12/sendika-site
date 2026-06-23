"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tenant } from "@/lib/tenant";
import { extractSlugFromHostname } from "@/lib/tenant-hostname";

interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
});

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTenant = async () => {
      const supabase = createClient();
      const slug = extractSlugFromHostname(window.location.hostname);

      let { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      // Bulunamadıysa custom_domain ile dene
      if (!data && slug === "default") {
        const host = window.location.hostname.split(":")[0];
        const customRes = await supabase
          .from("tenants")
          .select("*")
          .eq("custom_domain", host)
          .maybeSingle();
        data = customRes.data;
      }

      // Hâlâ yoksa default'a düş
      if (!data) {
        const defaultRes = await supabase
          .from("tenants")
          .select("*")
          .eq("slug", "default")
          .maybeSingle();
        data = defaultRes.data;
      }

      setTenant(data as Tenant | null);
      setLoading(false);
    };

    fetchTenant();
  }, []);

  return (
    <TenantContext.Provider value={{ tenant, loading }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
