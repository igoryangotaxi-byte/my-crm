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
import { CallCenterRuntime } from "@/components/call-center/CallCenterRuntime";
import { Suspense } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/ui/cn";

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { language } = useAuth();
  const { collapsed } = useSalesSidebar();
  const { density } = useSalesDensity();
  const rtl = language === "he";
  const mapFullBleed = pathname.startsWith("/sales-operation/request-rides");
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
      className={cn(
        "relative flex overflow-x-hidden bg-[var(--so-bg)]",
        mapFullBleed ? "h-dvh min-h-0" : "min-h-screen",
      )}
    >
      <CommandPalette />
      <SalesOperationSidebar />
      <div
        className={cn(
          "relative z-[1] flex min-w-0 flex-1 flex-col",
          mapFullBleed ? "h-dvh min-h-0 p-2 sm:p-2.5" : "min-h-screen p-2 sm:p-2.5",
          offset,
        )}
      >
        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-sm)]",
          )}
        >
          <SalesOperationHeader />
          <main
            className={cn(
              "make-shell-main min-h-0 min-w-0 flex-1",
              mapFullBleed
                ? "relative flex flex-col overflow-hidden p-0"
                : "overflow-auto px-4 py-4 sm:px-5 lg:px-6",
            )}
          >
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
                    <CallCenterRuntime>
                      <ShellInner>{children}</ShellInner>
                    </CallCenterRuntime>
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
