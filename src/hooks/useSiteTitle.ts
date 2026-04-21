"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useSiteTitle(fallback = "Sendika Adı") {
  const [title, setTitle] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("site_settings")
      .select("value")
      .eq("key", "site_title")
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.value) setTitle(data.value);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return title;
}
