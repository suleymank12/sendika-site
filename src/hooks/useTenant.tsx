"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tenant } from "@/lib/tenant";

interface TenantContextValue {
  tenant: Tenant | null;
  loading: boolean;
}

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  loading: true,
});

function extractSlugFromHostname(hostname: string): string {
  const host = hostname.split(":")[0];

  if (host === "localhost" || host === "127.0.0.1") {
    return "default";
  }

  if (host.endsWith(".localhost")) {
    const sub = host.replace(/\.localhost$/, "");
    if (!sub || sub === "www") return "default";
    return sub;
  }

  if (host.endsWith(".vercel.app")) {
    const parts = host.replace(".vercel.app", "").split(".");
    if (parts.length <= 1) return "default";
    return parts[0];
  }

  const parts = host.split(".");
  if (parts.length <= 2) return "default";
  const first = parts[0];
  if (first === "www") return "default";
  return first;
}

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
