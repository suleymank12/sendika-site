"use client";

import { Menu, LogOut, User, ChevronDown, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSidebar } from "@/hooks/useAdminSidebar";
import { cn } from "@/lib/utils";

interface AdminHeaderProps {
  title: string;
  action?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
}

export default function AdminHeader({ title, action, breadcrumbs }: AdminHeaderProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const { toggle } = useSidebar();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email || "");
    });
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/giris");
  };

  const initials = email
    ? email
        .split("@")[0]
        .split(/[.\-_]/)
        .map((p) => p[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "?";

  const backHref = breadcrumbs?.find((b) => b.href)?.href;
  const backLabel = breadcrumbs?.find((b) => b.href)?.label;

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-text-muted hover:bg-bg-light lg:hidden shrink-0"
          aria-label="Menüyü aç/kapat"
        >
          <Menu className="h-5 w-5" />
        </button>
        {backHref && (
          <Link
            href={backHref}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium text-text-muted hover:text-text-dark hover:bg-bg-light transition-colors shrink-0"
            aria-label={`${backLabel} sayfasına dön`}
            title={`${backLabel} sayfasına dön`}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Geri
          </Link>
        )}
        <div className="min-w-0">
          {breadcrumbs && breadcrumbs.length > 0 && (
            <div className="flex items-center gap-1 text-xs text-text-muted mb-0.5">
              {breadcrumbs.map((b, i) => (
                <span key={i} className="flex items-center gap-1">
                  {i > 0 && <span className="text-text-muted/50">/</span>}
                  {b.href ? (
                    <Link
                      href={b.href}
                      className="text-primary hover:underline underline-offset-2 transition-colors"
                    >
                      {b.label}
                    </Link>
                  ) : (
                    <span>{b.label}</span>
                  )}
                </span>
              ))}
            </div>
          )}
          <h1 className="text-lg font-bold text-text-dark tracking-tight truncate">{title}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {action && <div className="mr-2">{action}</div>}

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className={cn(
              "flex items-center gap-2 rounded-lg pl-1.5 pr-2 py-1.5 transition-colors",
              menuOpen ? "bg-bg-light" : "hover:bg-bg-light"
            )}
            aria-label="Kullanıcı menüsü"
          >
            <span className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-white text-xs font-semibold">
              {initials}
            </span>
            <span className="hidden sm:block text-sm text-text-dark font-medium max-w-[160px] truncate">
              {email}
            </span>
            <ChevronDown
              className={cn(
                "h-4 w-4 text-text-muted transition-transform hidden sm:block",
                menuOpen && "rotate-180"
              )}
            />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-border bg-white shadow-lg overflow-hidden z-50">
              <div className="px-3 py-2.5 border-b border-border">
                <p className="text-xs text-text-muted">Giriş yapıldı</p>
                <p className="text-sm font-medium text-text-dark truncate">{email}</p>
              </div>
              <div className="py-1">
                <a
                  href="/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-text-dark hover:bg-bg-light transition-colors"
                >
                  <User className="h-4 w-4 text-text-muted" />
                  Siteyi Görüntüle
                </a>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/5 transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Çıkış Yap
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
