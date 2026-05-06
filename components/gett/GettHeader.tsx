"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

const gettPageMeta: Record<string, { title: string; subtitle: string }> = {
  "/gett/request-rides": { title: "Request Rides", subtitle: "Gett B2C order creation flow" },
  "/gett/pre-orders": { title: "Pre-Orders", subtitle: "Upcoming scheduled Gett rides" },
  "/gett/orders": { title: "Orders", subtitle: "Gett order statuses and lifecycle" },
  "/gett/bussiness-center": { title: "Bussiness Center", subtitle: "Gett spend and operational metrics" },
};

export function GettHeader() {
  const pathname = usePathname();
  const { currentUser, logout, language, updateUserLanguage } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const pageRoute = Object.keys(gettPageMeta).find((route) => pathname.startsWith(route)) ?? "/gett/request-rides";
  const currentPage = gettPageMeta[pageRoute];
  const avatarText =
    currentUser?.name?.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") ||
    "AO";

  return (
    <header className="crm-surface sticky top-3 z-20 mx-3 mb-2 flex min-h-16 items-center justify-between rounded-2xl border-amber-100 px-5 py-3 lg:px-6">
      <div className="min-w-0">
        <p className="crm-label mb-0.5 text-[0.62rem] tracking-[0.14em] text-muted">Appli Gett Oz</p>
        <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">{currentPage.title}</h1>
        <p className="crm-subtitle mt-0.5 line-clamp-2 max-sm:text-[0.8rem]">{currentPage.subtitle}</p>
      </div>

      <div className={`${language === "he" ? "mr-2" : "ml-2"} flex items-center gap-3`}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="crm-button-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
          >
            {avatarText}
          </button>
          {isUserMenuOpen ? (
            <div className={`crm-surface absolute mt-2 w-64 rounded-2xl p-3 ${language === "he" ? "left-0" : "right-0"}`}>
              <p className="text-xs text-muted">Signed in as</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{currentUser?.email ?? "Unknown user"}</p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateUserLanguage("en")}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    language === "en" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => updateUserLanguage("he")}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    language === "he" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  Hebrew
                </button>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsUserMenuOpen(false);
                  logout();
                }}
                className="crm-button-primary mt-3 w-full rounded-xl px-3 py-2 text-sm font-medium"
              >
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
