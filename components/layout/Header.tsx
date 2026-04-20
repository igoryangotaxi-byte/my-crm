 "use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clients": "Clients",
  "/orders": "Orders",
  "/pre-orders": "Pre-Orders",
  "/price-calculator": "Price Calculator",
  "/accesses": "Access managment",
  "/notes": "Notes",
};

type HeaderProps = {
  onToggleSidebar: () => void;
};

export function Header({ onToggleSidebar }: HeaderProps) {
  const pathname = usePathname();
  const { currentUser, logout, currentArea, setCurrentArea, canAccessArea } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const pageTitle =
    Object.keys(pageTitles).find((route) => pathname.startsWith(route)) ??
    "/dashboard";
  const avatarText =
    currentUser?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AO";

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-panel px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg text-slate-700 transition hover:bg-slate-200"
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        <div className="min-w-0">
          <p className="text-sm text-muted">Appli Taxi Oz</p>
          <p className="truncate text-base font-semibold text-foreground">
            {pageTitles[pageTitle]}
          </p>
        </div>
      </div>

      <div className="mx-4 hidden w-full max-w-2xl items-center gap-3 lg:flex">
        <input
          type="search"
          placeholder="Search..."
          className="h-10 w-full rounded-xl border border-border bg-[#f5f5f7] px-3 text-sm outline-none transition focus:border-accent"
        />
        <div className="inline-flex rounded-full border border-border bg-white p-1">
          {([
            { key: "b2b", label: "B2B" },
            { key: "b2c", label: "B2C" },
          ] as const).map((item) => {
            const allowed = canAccessArea(item.key);
            const active = currentArea === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={!allowed}
                onClick={() => setCurrentArea(item.key)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${
                  active
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="ml-2 flex items-center gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-xs font-bold text-white"
            aria-label="Open user menu"
          >
            {avatarText}
          </button>
          {isUserMenuOpen ? (
            <div className="absolute right-0 mt-2 w-64 rounded-2xl border border-border bg-white p-3 shadow-lg">
              <p className="text-xs text-muted">Signed in as</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {currentUser?.email ?? "Unknown user"}
              </p>
              <p className="mt-1 text-xs text-slate-600">
                Role: {currentUser?.role ?? "n/a"}
              </p>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="mt-3 w-full rounded-xl bg-slate-100 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Log out
              </button>
            </div>
          ) : null}
          {isUserMenuOpen ? (
            <button
              type="button"
              aria-label="Close user menu overlay"
              onClick={() => setIsUserMenuOpen(false)}
              className="fixed inset-0 z-[-1] cursor-default"
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
