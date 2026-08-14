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
import { OfficeModeProvider } from "@/components/sales-operation/office/OfficeModeContext";
import { SalesDensityProvider, useSalesDensity } from "@/components/sales-operation/SalesDensityContext";
import { CommandPalette } from "@/components/patterns/CommandPalette";
import { AiPageContextProvider } from "@/components/ai/AiPageContext";
import { Suspense } from "react";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { language } = useAuth();
  const { collapsed } = useSalesSidebar();
  const { density } = useSalesDensity();
  const rtl = language === "he";
  const offset = rtl
    ? collapsed
      ? "lg:pr-[72px]"
      : "lg:pr-[240px]"
    : collapsed
      ? "lg:pl-[72px]"
      : "lg:pl-[240px]";

  return (
    <div
      data-module="sales-operation"
      data-density={density}
      className="relative flex min-h-screen overflow-x-hidden bg-[var(--so-bg)]"
    >
      <CommandPalette />
      <SalesOperationSidebar />
      <div
        className={`relative z-[1] flex min-h-screen min-w-0 flex-1 flex-col p-2 sm:p-2.5 ${offset}`}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-sm)]">
          <SalesOperationHeader />
          <main className="make-shell-main min-h-0 min-w-0 flex-1 overflow-auto px-4 py-4 sm:px-5 lg:px-6">
            {children}
          </main>
        </div>
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
            <SalesDensityProvider>
              <OfficeModeProvider>
                <Suspense fallback={null}>
                  <AiPageContextProvider>
                    <ShellInner>{children}</ShellInner>
                  </AiPageContextProvider>
                </Suspense>
              </OfficeModeProvider>
            </SalesDensityProvider>
          </SalesSidebarProvider>
        </ConfirmProvider>
      </ToastProvider>
    </RouteLoadingProvider>
  );
}
