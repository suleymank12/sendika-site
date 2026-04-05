"use client";

import { Menu, LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSidebar } from "@/hooks/useAdminSidebar";

interface AdminHeaderProps {
  title: string;
}

export default function AdminHeader({ title }: AdminHeaderProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const { toggle } = useSidebar();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email || "");
    });
  }, []);

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/giris");
  };

  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border bg-white px-4 py-3 lg:px-6">
      <div className="flex items-center gap-3">
        <button
          onClick={toggle}
          className="rounded-lg p-2 text-text-muted hover:bg-bg-light lg:hidden"
          aria-label="Menüyü aç/kapat"
        >
          <Menu className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-text-dark tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-text-muted sm:block">{email}</span>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm text-text-muted hover:bg-bg-light hover:text-error transition-colors"
          aria-label="Çıkış yap"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Çıkış</span>
        </button>
      </div>
    </header>
  );
}
