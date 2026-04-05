"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/admin/Sidebar";
import ToastProvider from "@/components/ui/Toast";
import { SidebarProvider, useSidebar } from "@/hooks/useAdminSidebar";

function AdminLayoutInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isOpen, close } = useSidebar();

  if (pathname === "/admin/giris") {
    return (
      <>
        {children}
        <ToastProvider />
      </>
    );
  }

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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </SidebarProvider>
  );
}
