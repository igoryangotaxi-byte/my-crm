 "use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppPageKey, BusinessArea } from "@/types/auth";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "B2B pre-orders analytics",
  },
  "/clients": {
    title: "Clients",
    subtitle: "Manage your client base",
  },
  "/orders": {
    title: "Orders",
    subtitle: "B2B orders with filters and details",
  },
  "/pre-orders": {
    title: "Pre-Orders",
    subtitle: "Upcoming scheduled rides from Yango API",
  },
  "/price-calculator": {
    title: "Price Calculator",
    subtitle: "Estimate Taximeter by MOT and Yango Tariff",
  },
  "/request-rides": {
    title: "Request Rides",
    subtitle: "Create ride requests via selected client API",
  },
  "/accesses": {
    title: "Access managment",
    subtitle: "Manage role permissions and registration approvals",
  },
  "/notes": {
    title: "Notes",
    subtitle: "Token diagnostics and release notes",
  },
};

export function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout, currentArea, setCurrentArea, canAccessArea, canAccess } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const pageRoute =
    Object.keys(pageMeta).find((route) => pathname.startsWith(route)) ??
    "/dashboard";
  const currentPage = pageMeta[pageRoute];
  const avatarText =
    currentUser?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AO";

  const areaLandingCandidates: Record<BusinessArea, Array<{ page: AppPageKey; path: string }>> = {
    b2b: [
      { page: "requestRides", path: "/request-rides" },
      { page: "dashboard", path: "/dashboard" },
      { page: "orders", path: "/orders" },
      { page: "preOrders", path: "/pre-orders" },
      { page: "priceCalculator", path: "/price-calculator" },
    ],
    b2c: [{ page: "driversMap", path: "/drivers-map" }],
  };

  const resolveAreaLandingPath = (area: BusinessArea): string => {
    const prefix = pathname.startsWith("/client") ? "/client" : "";
    const candidate = areaLandingCandidates[area].find((item) => canAccess(item.page));
    if (candidate) return `${prefix}${candidate.path}`;
    return area === "b2c" ? `${prefix}/drivers-map` : `${prefix}/request-rides`;
  };

  return (
    <header className="crm-surface sticky top-3 z-10 mx-3 mb-2 flex h-16 items-center justify-between rounded-2xl border-white/70 px-5 lg:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Appli Taxi Oz</p>
          <p className="truncate text-base font-semibold text-foreground">
            {currentPage.title}{" "}
            <span className="font-medium text-muted">{currentPage.subtitle}</span>
          </p>
        </div>
      </div>

      <div className="mx-4 hidden w-full max-w-2xl items-center gap-3 lg:flex">
        <input
          type="search"
          placeholder="Search..."
          className="crm-input h-10 w-full px-3 text-sm"
        />
        <div className="inline-flex rounded-full border border-white/70 bg-white/75 p-1 shadow-[0_8px_18px_rgba(15,23,42,0.14)]">
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
                onClick={() => {
                  if (currentArea === item.key) return;
                  setCurrentArea(item.key);
                  const targetPath = resolveAreaLandingPath(item.key);
                  if (!pathname.startsWith(targetPath)) {
                    router.push(targetPath);
                  }
                }}
                className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-red-200 bg-red-50 text-red-700 shadow-[0_8px_16px_rgba(239,68,68,0.15)]"
                    : "border-transparent text-slate-700 hover:bg-white"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span
                  className={`inline-block border-b-2 pb-0.5 ${
                    active ? "border-red-500" : "border-transparent"
                  }`}
                >
                  {item.label}
                </span>
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
            className="crm-button-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
            aria-label="Open user menu"
          >
            {avatarText}
          </button>
          {isUserMenuOpen ? (
            <div className="crm-surface absolute right-0 mt-2 w-64 rounded-2xl p-3">
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
                className="crm-button-primary mt-3 w-full rounded-xl px-3 py-2 text-sm font-medium"
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
