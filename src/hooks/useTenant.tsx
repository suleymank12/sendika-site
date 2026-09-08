"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Tenant } from "@/lib/tenant";
import { parseHostname } from "@/lib/tenant-hostname";

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

      // parseHostname TEK KAYNAK: hem slug hem custom_domain host'u buradan
      // gelir. Onceden custom_domain lookup'i window.location.hostname'i HAM
      // kullaniyordu; "www." soyulmadigi icin www.musteri.com, DB'deki
      // "musteri.com" ile eslesmeyip tenant default'a dusuyordu.
      const match = parseHostname(window.location.hostname);
      const slug = match.type === "subdomain" ? match.slug : "default";

      let { data } = await supabase
        .from("tenants")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      // Bulunamadıysa custom_domain ile dene (match.host www'suz normalize)
      if (!data && match.type === "custom_domain") {
        const customRes = await supabase
          .from("tenants")
          .select("*")
          .eq("custom_domain", match.host)
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
