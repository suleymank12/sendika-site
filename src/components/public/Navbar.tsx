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

function DesktopDropdown({ item, children }: { item: MenuItem; children: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const handleEnter = () => {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpen(false), 150);
  };

  if (children.length === 0) {
    return (
      <Link
        href={item.url || "#"}
        className="px-4 py-2 text-base font-medium text-white/90 hover:text-white transition-colors"
      >
        {item.title}
      </Link>
    );
  }

  return (
    <div className="relative" onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
      <button className="flex items-center gap-1 px-4 py-2 text-base font-medium text-white/90 hover:text-white transition-colors">
        {item.title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-52 rounded-lg bg-white shadow-lg border border-border py-1.5 z-50">
          {children.map((sub) => (
            <Link
              key={sub.id}
              href={sub.url || "#"}
              className="block px-4 py-2 text-sm text-text-dark hover:bg-bg-light hover:text-primary transition-colors"
            >
              {sub.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileAccordion({ item, children, onClose }: { item: MenuItem; children: MenuItem[]; onClose: () => void }) {
  const [open, setOpen] = useState(false);

  if (children.length === 0) {
    return (
      <Link
        href={item.url || "#"}
        onClick={onClose}
        className="block px-4 py-3 text-sm font-medium text-text-dark border-b border-border hover:bg-bg-light"
      >
        {item.title}
      </Link>
    );
  }

  return (
    <div className="border-b border-border">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-text-dark hover:bg-bg-light"
      >
        {item.title}
        <ChevronRight className={cn("h-4 w-4 text-text-muted transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="bg-bg-light">
          {children.map((sub) => (
            <Link
              key={sub.id}
              href={sub.url || "#"}
              onClick={onClose}
              className="block px-8 py-2.5 text-sm text-text-muted hover:text-primary transition-colors"
            >
              {sub.title}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

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
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const parents = menuItems.filter((i) => !i.parent_id).sort((a, b) => a.order - b.order);
  const getChildren = (parentId: string) =>
    menuItems.filter((i) => i.parent_id === parentId).sort((a, b) => a.order - b.order);

  return (
    <nav className={cn("sticky top-0 z-50 bg-primary transition-shadow", scrolled && "shadow-lg")}>
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
          <span className="text-white font-bold text-xl tracking-tight hidden sm:block">{siteTitle}</span>
        </Link>

        {/* Desktop menu */}
        <div className="hidden lg:flex items-center gap-1">
          {parents.map((item) => (
            <DesktopDropdown key={item.id} item={item}>
              {getChildren(item.id)}
            </DesktopDropdown>
          ))}
        </div>

        {/* Mobile hamburger */}
        <button onClick={() => setMobileOpen(true)} className="lg:hidden rounded-lg p-2 text-white/80 hover:text-white">
          <Menu className="h-6 w-6" />
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="fixed top-0 right-0 h-full w-72 bg-white shadow-xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-4 border-b border-border">
              <span className="font-bold text-primary">{siteTitle}</span>
              <button onClick={() => setMobileOpen(false)} className="p-1 text-text-muted hover:text-text-dark">
                <X className="h-5 w-5" />
              </button>
            </div>
            {parents.map((item) => (
              <MobileAccordion key={item.id} item={item} onClose={() => setMobileOpen(false)}>
                {getChildren(item.id)}
              </MobileAccordion>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
