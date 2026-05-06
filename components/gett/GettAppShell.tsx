"use client";

import { useAuth } from "@/components/auth/AuthProvider";
import { RouteLoadingBar, RouteLoadingProvider } from "@/components/layout/RouteLoadingContext";
import { GettHeader } from "@/components/gett/GettHeader";
import { GettSidebar } from "@/components/gett/GettSidebar";

export function GettAppShell({ children }: { children: React.ReactNode }) {
  const { language } = useAuth();
  return (
    <RouteLoadingProvider>
      <RouteLoadingBar />
      <div className="crm-make-shell gett-theme relative flex min-h-screen overflow-x-hidden bg-background">
        <GettSidebar />
        <div
          className={`make-shell-inner relative z-[1] flex flex-1 flex-col ${
            language === "he" ? "min-h-screen pr-16" : "min-h-screen pl-16"
          }`}
        >
          <GettHeader />
          <main className="make-shell-main flex-1 mx-3 px-5 py-5 lg:py-6">{children}</main>
        </div>
      </div>
    </RouteLoadingProvider>
  );
}
