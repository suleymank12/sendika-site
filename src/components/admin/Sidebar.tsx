"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Newspaper,
  Megaphone,
  FileText,
  Camera,
  Folders,
  Presentation,
  Star,
  MousePointerClick,
  LayoutGrid,
  ListTree,
  Users,
  Building2,
  Settings,
  LogOut,
  X,
  type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useSiteTitle } from "@/hooks/useSiteTitle";

interface MenuItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

interface MenuGroup {
  label: string | null;
  items: MenuItem[];
}

const menuGroups: MenuGroup[] = [
  {
    label: null,
    items: [{ label: "Özet", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "İçerik Yönetimi",
    items: [
      { label: "Haberler", href: "/admin/haberler", icon: Newspaper },
      { label: "Haber Kategorileri", href: "/admin/kategoriler", icon: Folders },
      { label: "Duyurular", href: "/admin/duyurular", icon: Megaphone },
      { label: "Sabit Sayfalar", href: "/admin/sayfalar", icon: FileText },
      { label: "Foto Galeri", href: "/admin/galeri", icon: Camera },
    ],
  },
  {
    label: "Anasayfa Düzeni",
    items: [
      { label: "Anasayfa Slider", href: "/admin/slider", icon: Presentation },
      { label: "Manşet Haber", href: "/admin/manset", icon: Star },
      { label: "Hızlı Erişim Butonları", href: "/admin/hizli-erisim", icon: MousePointerClick },
      { label: "Anasayfa Bölümleri", href: "/admin/anasayfa-bolumleri", icon: LayoutGrid },
    ],
  },
  {
    label: "Kurumsal",
    items: [
      { label: "Site Menüsü", href: "/admin/menu", icon: ListTree },
      { label: "Yönetim Kurulu", href: "/admin/yonetim-kurulu", icon: Users },
      { label: "Şubelerimiz", href: "/admin/subeler", icon: Building2 },
    ],
  },
  {
    label: "Ayarlar",
    items: [{ label: "Site Ayarları", href: "/admin/ayarlar", icon: Settings }],
  },
];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const siteTitle = useSiteTitle();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/giris");
  };

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-bg-dark flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Title */}
        <div className="flex items-center justify-between px-5 py-5 border-b border-white/10">
          <Link href="/admin" className="text-white font-bold text-lg tracking-tight truncate">
            {siteTitle}
          </Link>
          <button onClick={onClose} className="lg:hidden text-white/60 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-4 px-3">
          <div className="space-y-5">
            {menuGroups.map((group, gi) => (
              <div key={gi}>
                {group.label && (
                  <p className="px-3 pb-1.5 text-[11px] uppercase tracking-wider font-semibold text-white/40">
                    {group.label}
                  </p>
                )}
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          isActive(item.href)
                            ? "bg-primary text-white"
                            : "text-white/60 hover:bg-white/10 hover:text-white"
                        )}
                      >
                        <item.icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Logout */}
        <div className="border-t border-white/10 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/60 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Çıkış Yap
          </button>
        </div>
      </aside>
    </>
  );
}
