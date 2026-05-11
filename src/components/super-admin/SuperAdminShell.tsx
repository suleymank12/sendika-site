"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import SuperAdminSidebar from "./SuperAdminSidebar";

interface Props {
  email: string;
  children: React.ReactNode;
}

export default function SuperAdminShell({ email, children }: Props) {
  const [isOpen, setIsOpen] = useState(false);

  return (
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
  );
}
