"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import SuperAdminSidebar from "./SuperAdminSidebar";
import { IdleTimeoutProvider } from "@/hooks/useIdleTimeout";
import { SUPER_ADMIN_LOGIN_PATH } from "@/lib/constants";

interface Props {
  email: string;
  children: React.ReactNode;
}

export default function SuperAdminShell({ email, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  // Oturum zaman asimi: admin paneliyle ayni sure (hooks/useIdleTimeout.tsx).
  // loginPath: bu panel ayri host'ta ve orada /admin/giris YOK — zaman
  // asimi kendi giris sayfasina donmeli (19 Eylul 2026).
  return (
    <IdleTimeoutProvider loginPath={SUPER_ADMIN_LOGIN_PATH}>
      <div className="flex h-screen bg-gray-50">
        <SuperAdminSidebar isOpen={isOpen} onClose={() => setIsOpen(false)} email={email} />
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile top bar */}
          <div className="lg:hidden flex items-center gap-3 border-b border-border bg-white px-4 py-3">
            <button
              onClick={() => setIsOpen(true)}
              className="rounded-lg p-2 text-text-muted hover:bg-bg-light"
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-semibold text-text-dark">Platform Yönetimi</span>
          </div>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </IdleTimeoutProvider>
  );
}
