"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useTranslations } from "next-intl";
import { Check, LogOut, Menu } from "lucide-react";
import { SalesNotificationsBell } from "@/components/sales-operation/SalesNotificationsBell";
import { SalesGlobalSearch } from "@/components/sales-operation/SalesGlobalSearch";
import { useSalesSidebar } from "@/components/sales-operation/SalesSidebarContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

const salesOperationPageMeta: Record<string, { titleKey: string; subtitleKey: string }> = {
  "/sales-operation/pipeline": { titleKey: "page.pipeline.title", subtitleKey: "page.pipeline.subtitle" },
  "/sales-operation/tasks": { titleKey: "page.tasks.title", subtitleKey: "page.tasks.subtitle" },
  "/sales-operation/portfolio": { titleKey: "page.portfolio.title", subtitleKey: "page.portfolio.subtitle" },
  "/sales-operation/b2b-clients/trips": { titleKey: "page.b2bClientTrips.title", subtitleKey: "page.b2bClientTrips.subtitle" },
  "/sales-operation/b2b-clients": { titleKey: "page.b2bClients.title", subtitleKey: "page.b2bClients.subtitle" },
  "/sales-operation/analytics": { titleKey: "page.analytics.title", subtitleKey: "page.analytics.subtitle" },
  "/sales-operation/manager-analytics": { titleKey: "page.managerAnalytics.title", subtitleKey: "page.managerAnalytics.subtitle" },
  "/sales-operation/performance": { titleKey: "page.performance.title", subtitleKey: "page.performance.subtitle" },
  "/sales-operation/automation": { titleKey: "page.automation.title", subtitleKey: "page.automation.subtitle" },
  "/sales-operation/settings": { titleKey: "page.settings.title", subtitleKey: "page.settings.subtitle" },
};

export function SalesOperationHeader() {
  const pathname = usePathname();
  const { currentUser, logout, language, updateUserLanguage } = useAuth();
  const tLayout = useTranslations("layout");
  const tLanguage = useTranslations("language");
  const tSales = useTranslations("salesOperation");
  const { setMobileOpen } = useSalesSidebar();

  const isClientDetailPage = /^\/sales-operation\/b2b-clients\/(?!trips$)[^/]+$/.test(pathname);
  const pageRoute =
    Object.keys(salesOperationPageMeta)
      .sort((a, b) => b.length - a.length)
      .find((route) => pathname.startsWith(route)) ?? "/sales-operation/pipeline";
  const currentPage = isClientDetailPage
    ? { titleKey: "page.clientDetail.title", subtitleKey: "page.clientDetail.subtitle" }
    : salesOperationPageMeta[pageRoute];

  const avatarText =
    currentUser?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AO";

  return (
    <header className="sticky top-0 z-[60] mx-3 mb-2 mt-3 flex min-h-16 items-center justify-between gap-3 rounded-2xl border border-[var(--so-border)] bg-[var(--so-surface)]/95 px-4 py-3 shadow-[var(--so-shadow-sm)] backdrop-blur-sm lg:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label={tLayout("openUserMenu")}
          className="so-focus-ring inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--so-border-strong)] text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
        <div className="min-w-0">
          <p className="crm-label mb-0.5 text-[0.6rem] tracking-[0.14em] text-[var(--so-muted-2)]">
            {tSales("sectionLabel")}
          </p>
          <h1 className="truncate text-base font-bold tracking-tight text-[var(--so-text)] sm:text-lg">
            {tSales(currentPage.titleKey)}
          </h1>
          <p className="mt-0.5 line-clamp-1 text-[0.8rem] text-[var(--so-muted)] max-sm:hidden">
            {tSales(currentPage.subtitleKey)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <SalesGlobalSearch />
        <SalesNotificationsBell />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="so-focus-ring flex h-9 w-9 items-center justify-center rounded-full bg-[var(--so-accent)] text-xs font-bold text-white transition-colors hover:bg-[var(--so-accent-strong)]"
              aria-label={tLayout("openUserMenu")}
            >
              {avatarText}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>{tLayout("signedInAs")}</DropdownMenuLabel>
            <p className="truncate px-2.5 pb-1.5 text-sm font-semibold text-[var(--so-text)]">
              {currentUser?.email ?? tLayout("unknownUser")}
            </p>
            <DropdownMenuSeparator />
            <div className="flex items-center gap-2 px-2.5 py-1.5">
              {(["en", "he"] as const).map((lng) => (
                <button
                  key={lng}
                  type="button"
                  onClick={() => updateUserLanguage(lng)}
                  className={`inline-flex flex-1 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
                    language === lng
                      ? "border-[var(--so-accent)] bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                      : "border-[var(--so-border-strong)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]"
                  }`}
                >
                  {language === lng ? <Check className="h-3.5 w-3.5" /> : null}
                  {tLanguage(lng)}
                </button>
              ))}
            </div>
            <DropdownMenuSeparator />
            <button
              type="button"
              onClick={() => logout()}
              className="flex w-full items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50"
            >
              <LogOut className="h-4 w-4" />
              {tLayout("logout")}
            </button>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
