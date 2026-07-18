"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { RouteLoadingBar, RouteLoadingProvider } from "@/components/layout/RouteLoadingContext";
import { SalesOperationHeader } from "@/components/sales-operation/SalesOperationHeader";
import { SalesOperationSidebar } from "@/components/sales-operation/SalesOperationSidebar";
import {
  SalesSidebarProvider,
  useSalesSidebar,
} from "@/components/sales-operation/SalesSidebarContext";
import { ToastProvider } from "@/components/ui/Toast";
import { ConfirmProvider } from "@/components/ui/ConfirmDialog";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { language } = useAuth();
  const { collapsed } = useSalesSidebar();
  const rtl = language === "he";
  // Desktop content offset follows the pinned sidebar width; mobile has no offset
  // (the sidebar is an off-canvas overlay there).
  const offset = rtl
    ? collapsed
      ? "lg:pr-[76px]"
      : "lg:pr-[248px]"
    : collapsed
      ? "lg:pl-[76px]"
      : "lg:pl-[248px]";

  return (
    <div
      data-module="sales-operation"
      className="crm-make-shell relative flex min-h-screen overflow-x-hidden bg-background"
    >
      <SalesOperationSidebar />
      <div
        className={`make-shell-inner relative z-[1] flex min-h-screen min-w-0 flex-1 flex-col transition-[padding] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${offset}`}
      >
        <SalesOperationHeader />
        <main className="make-shell-main mx-3 min-w-0 flex-1 px-3 py-5 sm:px-5 lg:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export function SalesOperationAppShell({ children }: { children: React.ReactNode }) {
  return (
    <RouteLoadingProvider>
      <RouteLoadingBar />
      <ToastProvider>
        <ConfirmProvider>
          <SalesSidebarProvider>
            <ShellInner>{children}</ShellInner>
          </SalesSidebarProvider>
        </ConfirmProvider>
      </ToastProvider>
    </RouteLoadingProvider>
  );
}
