"use client";

import { Header } from "@/components/layout/Header";
import {
  RouteLoadingBar,
  RouteLoadingProvider,
} from "@/components/layout/RouteLoadingContext";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <RouteLoadingProvider>
      <RouteLoadingBar />
      <div className="relative flex min-h-screen bg-background">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(800px_460px_at_20%_6%,rgba(255,45,45,0.18),transparent_70%)]" />
        <Sidebar />

        <div className="relative z-[1] flex min-h-screen flex-1 flex-col">
          <Header />
          <main className="flex-1 p-5 lg:p-6">{children}</main>
        </div>
      </div>
    </RouteLoadingProvider>
  );
}
