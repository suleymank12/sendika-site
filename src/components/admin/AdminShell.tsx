"use client";

import Sidebar from "@/components/admin/Sidebar";
import ToastProvider from "@/components/ui/Toast";
import { SidebarProvider, useSidebar } from "@/hooks/useAdminSidebar";
import { DirtyFormProvider } from "@/hooks/useDirtyForm";
import { TenantProvider } from "@/hooks/useTenant";
import type { Tenant } from "@/lib/tenant";

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

/**
 * initialTenant: sunucuda cozulmus tenant (admin layout -> getCurrentTenant).
 * TenantProvider'a verilir; istemci tenant'i BIR DAHA cozmez. Gerekce ve
 * canli bug kaydi icin bkz. hooks/useTenant.tsx.
 */
export default function AdminShell({
  children,
  initialTenant,
}: {
  children: React.ReactNode;
  initialTenant?: Tenant | null;
}) {
  return (
    <TenantProvider initialTenant={initialTenant}>
      <SidebarProvider>
        <DirtyFormProvider>
          <AdminShellInner>{children}</AdminShellInner>
        </DirtyFormProvider>
      </SidebarProvider>
    </TenantProvider>
  );
}
