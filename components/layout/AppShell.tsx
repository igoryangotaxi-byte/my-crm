"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  RouteLoadingBar,
  RouteLoadingProvider,
} from "@/components/layout/RouteLoadingContext";
import { Sidebar } from "@/components/layout/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { language } = useAuth();
  const mapFullBleed =
    pathname === "/request-rides" || pathname.startsWith("/client/request-rides");

  return (
    <RouteLoadingProvider>
      <RouteLoadingBar />
      <div
        className={`crm-make-shell relative flex overflow-x-hidden bg-background ${
          mapFullBleed ? "min-h-dvh" : "min-h-screen"
        }`}
      >
        <Sidebar />

        <div
          className={`make-shell-inner relative z-[1] flex flex-1 flex-col ${
            mapFullBleed
              ? "h-dvh min-h-0 pl-0"
              : language === "he"
                ? "min-h-screen pr-16"
                : "min-h-screen pl-16"
          }`}
        >
          <Header />
          <main
            className={
              mapFullBleed
                ? "make-shell-main flex min-h-0 flex-1 flex-col overflow-visible p-0"
                : "make-shell-main flex-1 mx-3 px-5 py-5 lg:py-6"
            }
          >
            {children}
          </main>
        </div>
      </div>
    </RouteLoadingProvider>
  );
}
