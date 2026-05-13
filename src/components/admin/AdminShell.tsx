"use client";

import Sidebar from "@/components/admin/Sidebar";
import ToastProvider from "@/components/ui/Toast";
import { SidebarProvider, useSidebar } from "@/hooks/useAdminSidebar";
import { TenantProvider } from "@/hooks/useTenant";

function AdminShellInner({ children }: { children: React.ReactNode }) {
  const { isOpen, close } = useSidebar();

  return (
    <div className="flex h-screen bg-bg-light">
      <Sidebar isOpen={isOpen} onClose={close} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <ToastProvider />
    </div>
  );
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <SidebarProvider>
        <AdminShellInner>{children}</AdminShellInner>
      </SidebarProvider>
    </TenantProvider>
  );
}
