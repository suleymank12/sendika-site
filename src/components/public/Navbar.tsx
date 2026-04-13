"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, ChevronDown, ChevronRight } from "lucide-react";
import { MenuItem } from "@/types";
import { cn } from "@/lib/utils";

interface NavbarProps {
  menuItems: MenuItem[];
  logoUrl: string;
  siteTitle: string;
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

// ─── Desktop: recursive flyout menus ──────────────────────
function DesktopItem({ item, isNested = false }: { item: MenuItem; isNested?: boolean }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const children = item.children || [];
  const hasChildren = children.length > 0;

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };
  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  // Leaf node — no children
  if (!hasChildren) {
    return (
      <Link
        href={item.url || "#"}
        className={cn(
          "block transition-colors",
          isNested
            ? "px-4 py-2 text-sm text-text-dark hover:bg-bg-light hover:text-primary"
            : "px-4 py-2 text-base font-medium text-white/90 hover:text-white"
        )}
      >
        {item.title}
      </Link>
    );
  }

  // Top-level item with children
  if (!isNested) {
    return (
      <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        <button className="flex items-center gap-1 px-4 py-2 text-base font-medium text-white/90 hover:text-white transition-colors">
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
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <div className="flex items-center justify-between px-4 py-2 text-sm text-text-dark hover:bg-bg-light hover:text-primary cursor-pointer transition-colors">
        {item.url ? (
          <Link href={item.url} className="flex-1">
            {item.title}
          </Link>
        ) : (
          <span className="flex-1">{item.title}</span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
      </div>
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
  const paddingLeft = 16 + depth * 16;

  if (!hasChildren) {
    return (
      <Link
        href={item.url || "#"}
        onClick={onClose}
        className="block py-3 text-sm font-medium text-text-dark border-b border-border hover:bg-bg-light"
        style={{ paddingLeft, paddingRight: 16 }}
      >
        {item.title}
      </Link>
    );
  }

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between py-3 text-sm font-medium text-text-dark hover:bg-bg-light"
        style={{ paddingLeft, paddingRight: 16 }}
      >
        {item.title}
        <ChevronRight
          className={cn("h-4 w-4 text-text-muted transition-transform", open && "rotate-90")}
        />
      </button>
      {open && (
        <div className="bg-bg-light/50">
          {children.map((sub) => (
            <MobileItem key={sub.id} item={sub} onClose={onClose} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Navbar ──────────────────────────────────────────
export default function Navbar({ menuItems, logoUrl, siteTitle }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

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

  const tree = buildTree(menuItems);

  return (
    <nav
      className={cn(
        "sticky top-0 z-50 bg-primary transition-shadow",
        scrolled && "shadow-lg"
      )}
    >
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0">
          {logoUrl && logoUrl !== "/placeholder-logo.png" ? (
            <Image src={logoUrl} alt={siteTitle} width={44} height={44} className="h-11 w-auto" />
          ) : (
            <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xl">
              S
            </div>
          )}
          <span className="text-white font-bold text-xl tracking-tight hidden sm:block">
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
        >
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile overlay */}
      <div
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div
          className={cn(
            "fixed inset-0 bg-black/50 transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          className={cn(
            "fixed top-0 right-0 h-full w-72 bg-white shadow-xl overflow-y-auto transition-transform duration-300 ease-in-out",
            mobileOpen ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex items-center justify-between px-4 py-4 border-b border-border">
            <span className="font-bold text-primary">{siteTitle}</span>
            <button
              onClick={() => setMobileOpen(false)}
              className="p-1 text-text-muted hover:text-text-dark"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {tree.map((item) => (
            <MobileItem key={item.id} item={item} onClose={() => setMobileOpen(false)} />
          ))}
        </div>
      </div>
    </nav>
  );
}
