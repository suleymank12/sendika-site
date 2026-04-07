"use client";

import { useEffect, useState, useTransition } from "react";
import { usePathname, useSearchParams } from "next/navigation";

export default function PageLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);

  // Herhangi bir navigasyon başladığında loading'i aç
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const anchor = target.closest("a");
      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Dış linkler, hash linkler, javascript: linkler atla
      if (href.startsWith("http") || href.startsWith("#") || href.startsWith("javascript") || href.startsWith("mailto")) return;

      // Aynı sayfa ise atla
      if (href === pathname) return;

      setLoading(true);
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [pathname]);

  // Sayfa değiştiğinde (pathname veya searchParams değişince) loading'i kapat
  useEffect(() => {
    setLoading(false);
  }, [pathname, searchParams]);

  if (!loading) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-white/70 backdrop-blur-[2px] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        <p className="text-sm text-text-muted">Yükleniyor...</p>
      </div>
    </div>
  );
}
