"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function PageLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);

  // Sayfa degisince (mount/route degisimi) loading'i kapat
  useEffect(() => {
    document.body.classList.add("hydrated");
    setLoading(false);
  }, [pathname, searchParams]);

  // Internal link tiklamasinda hemen ac
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a") as HTMLAnchorElement | null;
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;
      if (
        href.startsWith("http") ||
        href.startsWith("#") ||
        href.startsWith("javascript") ||
        href.startsWith("mailto") ||
        href.startsWith("tel")
      )
        return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const currentFull = window.location.pathname + window.location.search;
      if (href === currentFull || href === window.location.pathname) return;

      setLoading(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-text-muted">Yükleniyor...</p>
      </div>
    </div>
  );
}
