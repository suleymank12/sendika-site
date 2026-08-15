"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { usePathname } from "next/navigation";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { MenuItem } from "@/types";
import { cn } from "@/lib/utils";
import useDialogA11y from "@/hooks/useDialogA11y";

interface NavbarProps {
  menuItems: MenuItem[];
  logoUrl: string;
  siteTitle: string;
  layoutType?: string;
}

// ─── Build tree from flat list ────────────────────────────
function buildTree(items: MenuItem[]): MenuItem[] {
  const map = new Map<string, MenuItem>();
  const roots: MenuItem[] = [];

  items.forEach((item) => map.set(item.id, { ...item, children: [] }));

  map.forEach((item) => {
    if (item.parent_id && map.has(item.parent_id)) {
      map.get(item.parent_id)!.children!.push(item);
    } else {
      roots.push(item);
    }
  });

  const sortItems = (arr: MenuItem[]) => {
    arr.sort((a, b) => a.order - b.order);
    arr.forEach((i) => i.children && sortItems(i.children));
  };
  sortItems(roots);
  return roots;
}

// ─── Desktop: recursive flyout menus (disclosure deseni) ──
// role="menu"/menubar BILEREK yok: APG'nin site navigasyonu icin onerdigi
// disclosure deseni — buton toggle + aria-expanded + Esc; Tab ile gezinilir.
function DesktopItem({ item, isNested = false }: { item: MenuItem; isNested?: boolean }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const children = item.children || [];
  const hasChildren = children.length > 0;

  // Bekleyen kapanma timeout'u unmount'ta temizlenir (eski sizinti)
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  // pointerType filtresi KRITIK: dokunmatikte tarayici dokunusa emule
  // mouseenter + click uretir — filtresiz tek dokunus "hover ile ac +
  // click ile kapa" olur ve menu hic acilmazdi. Boylece hover yalniz
  // gercek fareye; dokunus ve klavye click/toggle yoluna gider.
  const handlePointerEnter = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handlePointerLeave = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  const toggle = () => {
    clearTimeout(timeoutRef.current);
    setOpen((o) => !o);
  };

  // Esc: yalniz acik katmani kapat (stopPropagation ile ic ice flyout
  // katman katman kapanir), odak tetikleyici butona doner.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && open) {
      e.stopPropagation();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };

  // Tab ile sarmalayicinin disina cikinca acik kalmasin
  const handleBlur = (e: React.FocusEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
      setOpen(false);
    }
  };

  // Leaf node — no children
  if (!hasChildren) {
    return (
      <Link
        href={item.url || "#"}
        className={cn(
          "block transition-colors rounded-md",
          isNested
            ? "px-4 py-2 text-sm text-text-dark hover:bg-bg-light hover:text-primary"
            : "px-4 py-2 text-base font-medium text-white/90 hover:text-white hover:bg-white/10"
        )}
      >
        {item.title}
      </Link>
    );
  }

  // Top-level item with children
  if (!isNested) {
    return (
      <div
        className="relative"
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
      >
        <button
          ref={triggerRef}
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-1 px-4 py-2 text-base font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors rounded-md"
        >
          {item.title}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
        {open && (
          <div className="absolute top-full left-0 mt-1 w-52 rounded-lg bg-white shadow-lg border border-border py-1.5 z-50">
            {children.map((sub) => (
              <DesktopItem key={sub.id} item={sub} isNested />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Nested item with children — flyout to the right
  return (
    <div
      className="relative"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
    >
      {item.url ? (
        // Link + ayri chevron toggle: navigasyon ve acma ayri odak duraklari
        <div className="flex items-center justify-between text-sm text-text-dark hover:bg-bg-light hover:text-primary transition-colors">
          <Link href={item.url} className="flex-1 px-4 py-2">
            {item.title}
          </Link>
          <button
            ref={triggerRef}
            onClick={toggle}
            aria-expanded={open}
            aria-label={`${item.title} alt menüsü`}
            className="px-2 py-2 shrink-0 text-text-muted hover:text-primary"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <button
          ref={triggerRef}
          onClick={toggle}
          aria-expanded={open}
          className="flex w-full items-center justify-between px-4 py-2 text-sm text-text-dark hover:bg-bg-light hover:text-primary transition-colors"
        >
          <span className="flex-1 text-left">{item.title}</span>
          <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
        </button>
      )}
      {open && (
        <div className="absolute left-full top-0 ml-0.5 w-52 rounded-lg bg-white shadow-lg border border-border py-1.5 z-50">
          {children.map((sub) => (
            <DesktopItem key={sub.id} item={sub} isNested />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Mobile: recursive accordion ──────────────────────────
function MobileItem({
  item,
  onClose,
  depth = 0,
}: {
  item: MenuItem;
  onClose: () => void;
  depth?: number;
}) {
  const [open, setOpen] = useState(false);
  const children = item.children || [];
  const hasChildren = children.length > 0;
  const paddingLeft = 24 + depth * 16;

  if (!hasChildren) {
    return (
      <Link
        href={item.url || "#"}
        onClick={onClose}
        className="block py-3 text-base font-medium text-white border-b border-white/10 hover:bg-white/10 transition-colors"
        style={{ paddingLeft, paddingRight: 24 }}
      >
        {item.title}
      </Link>
    );
  }

  return (
    <div className="border-b border-white/10">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-base font-medium text-white hover:bg-white/10 transition-colors"
        style={{ paddingLeft, paddingRight: 24 }}
      >
        {item.title}
        <ChevronRight
          className={cn("h-4 w-4 text-white/70 transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="bg-black/20">
          {children.map((sub) => (
            <MobileItem key={sub.id} item={sub} onClose={onClose} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────
export default function Navbar({ menuItems, logoUrl, siteTitle, layoutType }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const isOverlayHome = pathname === "/" && layoutType === "layout2";

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Esc kapatir, acilista odak menuye tasinir, kapanista hamburger'a doner
  const mobileMenuRef = useDialogA11y<HTMLDivElement>({
    isOpen: mobileOpen,
    onEscape: () => setMobileOpen(false),
  });

  const tree = buildTree(menuItems);

  return (
    <>
    <nav
      aria-label="Ana menü"
      className={cn(
        "top-0 z-50 transition-all w-full",
        isOverlayHome
          ? "absolute left-0 right-0 bg-black/20 backdrop-blur-sm"
          : "sticky bg-primary",
        scrolled && "shadow-lg"
      )}
    >
      <div className="container mx-auto flex items-center justify-between gap-3 px-4 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <SafeImage
            // placeholder-logo.png "gercek logo yok" sentinel'i — harf avatarina dusulur
            src={logoUrl === "/placeholder-logo.png" ? null : logoUrl}
            alt={siteTitle}
            width={44}
            height={44}
            className="h-11 w-auto shrink-0"
            fallback={
              <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xl shrink-0">
                S
              </div>
            }
          />
          <span className="text-white font-bold text-base sm:text-xl tracking-tight truncate">
            {siteTitle}
          </span>
        </Link>

        {/* Desktop menu */}
        <div className="hidden lg:flex items-center gap-1">
          {tree.map((item) => (
            <DesktopItem key={item.id} item={item} />
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMobileOpen(true)}
          className="lg:hidden rounded-lg p-2 text-white/80 hover:text-white"
          aria-label="Menüyü aç"
          aria-expanded={mobileOpen}
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>
    </nav>

    {/* Mobile overlay — nav dışında, viewport'a göre konumlanır */}
    {mobileOpen && (
      <div
        ref={mobileMenuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menü"
        className="fixed inset-0 z-[100] lg:hidden bg-primary-dark flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <span className="font-bold text-white text-lg tracking-tight">{siteTitle}</span>
          <button
            onClick={() => setMobileOpen(false)}
            className="p-1 text-white/80 hover:text-white"
            aria-label="Menüyü kapat"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="flex flex-col overflow-y-auto flex-1">
          {tree.map((item) => (
            <MobileItem
              key={item.id}
              item={item}
              onClose={() => setMobileOpen(false)}
            />
          ))}
        </div>
      </div>
    )}
    </>
  );
}
