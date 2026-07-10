"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslations } from "next-intl";

const salesOperationPageMeta: Record<string, { titleKey: string; subtitleKey: string }> = {
  "/sales-operation/pipeline": {
    titleKey: "page.pipeline.title",
    subtitleKey: "page.pipeline.subtitle",
  },
  "/sales-operation/clients": {
    titleKey: "page.clients.title",
    subtitleKey: "page.clients.subtitle",
  },
  "/sales-operation/b2b-clients": {
    titleKey: "page.b2bClients.title",
    subtitleKey: "page.b2bClients.subtitle",
  },
  "/sales-operation/analytics": {
    titleKey: "page.analytics.title",
    subtitleKey: "page.analytics.subtitle",
  },
  "/sales-operation/manager-analytics": {
    titleKey: "page.managerAnalytics.title",
    subtitleKey: "page.managerAnalytics.subtitle",
  },
};

export function SalesOperationHeader() {
  const pathname = usePathname();
  const { currentUser, logout, language, updateUserLanguage } = useAuth();
  const tLayout = useTranslations("layout");
  const tLanguage = useTranslations("language");
  const tSales = useTranslations("salesOperation");
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isClientDetailPage = /^\/sales-operation\/clients\/[^/]+$/.test(pathname);
  const pageRoute =
    Object.keys(salesOperationPageMeta)
      .sort((a, b) => b.length - a.length)
      .find((route) => pathname.startsWith(route)) ?? "/sales-operation/pipeline";
  const currentPage = isClientDetailPage
    ? {
        titleKey: "page.clientDetail.title",
        subtitleKey: "page.clientDetail.subtitle",
      }
    : salesOperationPageMeta[pageRoute];
  const avatarText =
    currentUser?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AO";

  return (
    <header className="crm-surface sticky top-3 z-20 mx-3 mb-2 flex min-h-16 items-center justify-between rounded-2xl px-5 py-3 lg:px-6">
      <div className="min-w-0">
        <p className="crm-label mb-0.5 text-[0.62rem] tracking-[0.14em] text-muted">
          {tSales("sectionLabel")}
        </p>
        <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">
          {tSales(currentPage.titleKey)}
        </h1>
        <p className="crm-subtitle mt-0.5 line-clamp-2 max-sm:text-[0.8rem]">
          {tSales(currentPage.subtitleKey)}
        </p>
      </div>

      <div className={`${language === "he" ? "mr-2" : "ml-2"} flex items-center gap-3`}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsUserMenuOpen((prev) => !prev)}
            className="crm-button-primary flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
            aria-label={tLayout("openUserMenu")}
          >
            {avatarText}
          </button>
          {isUserMenuOpen ? (
            <div
              className={`crm-surface absolute mt-2 w-64 rounded-2xl p-3 ${
                language === "he" ? "left-0" : "right-0"
              }`}
            >
              <p className="text-xs text-muted">{tLayout("signedInAs")}</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {currentUser?.email ?? tLayout("unknownUser")}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateUserLanguage("en")}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    language === "en"
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {tLanguage("en")}
                </button>
                <button
                  type="button"
                  onClick={() => updateUserLanguage("he")}
                  className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                    language === "he"
                      ? "border-red-300 bg-red-50 text-red-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  {tLanguage("he")}
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
                {tLayout("logout")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
