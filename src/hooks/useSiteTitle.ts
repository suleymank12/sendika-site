"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTenant } from "@/hooks/useTenant";

export function useSiteTitle(fallback = "Sendika Adı") {
  const [title, setTitle] = useState(fallback);
  const { tenant } = useTenant();

  useEffect(() => {
    if (!tenant) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("site_settings")
      .select("value")
      .eq("tenant_id", tenant.id)
      .eq("key", "site_title")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.value) setTitle(data.value);
        else if (!cancelled && tenant.name) setTitle(tenant.name);
      });
    return () => {
      cancelled = true;
    };
  }, [tenant]);

  return title;
}
