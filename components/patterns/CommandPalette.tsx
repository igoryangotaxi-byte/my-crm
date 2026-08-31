"use client";

import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Command } from "cmdk";
import {
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  CalendarClock,
  Car,
  ClipboardList,
  Columns3,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  MessageSquare,
  Package,
  Phone,
  Plus,
  Route,
  Search,
  Settings,
  ShieldCheck,
  Target,
  Users,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppPageKey } from "@/types/auth";
import type { SearchResult } from "@/lib/sales-operation/search";
import { Kbd } from "@/components/ui/Kbd";

type NavItem = {
  href: string;
  labelKey: string;
  page: AppPageKey;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/sales-operation/tasks", labelKey: "mySpaceTasks", page: "salesPipeline", icon: LayoutGrid },
  { href: "/sales-operation/calendar", labelKey: "calendar", page: "salesPipeline", icon: CalendarClock },
  { href: "/sales-operation/pipeline", labelKey: "pipeline", page: "salesPipeline", icon: Columns3 },
  { href: "/sales-operation/office", labelKey: "office", page: "salesPipeline", icon: LayoutDashboard },
  { href: "/sales-operation/lead-discovery", labelKey: "leadDiscovery", page: "salesLeadDiscovery", icon: Search },
  { href: "/sales-operation/tracker", labelKey: "tracker", page: "salesTracker", icon: LayoutDashboard },
  { href: "/sales-operation/documentation", labelKey: "documentation", page: "salesDocumentation", icon: BookOpen },
  { href: "/sales-operation/portfolio", labelKey: "portfolio", page: "salesSignedClients", icon: Briefcase },
  { href: "/sales-operation/b2b-clients", labelKey: "b2bClients", page: "salesB2BClients", icon: Building2 },
  { href: "/sales-operation/analytics", labelKey: "analyticsOverview", page: "salesAnalytics", icon: LineChart },
  { href: "/sales-operation/manager-analytics", labelKey: "managerAnalytics", page: "salesManagerAnalytics", icon: Users },
  { href: "/sales-operation/performance", labelKey: "performance", page: "salesSettings", icon: Target },
  { href: "/sales-operation/automation", labelKey: "automation", page: "salesAutomation", icon: Workflow },
  { href: "/sales-operation/communications", labelKey: "communications", page: "communications", icon: MessageSquare },
  { href: "/sales-operation/pre-orders", labelKey: "preOrders", page: "preOrders", icon: ClipboardList },
  { href: "/sales-operation/request-rides", labelKey: "requestRides", page: "requestRides", icon: Car },
  { href: "/sales-operation/route-bundles", labelKey: "routeBundles", page: "preOrders", icon: Route },
  { href: "/sales-operation/orders", labelKey: "orders", page: "orders", icon: Package },
  { href: "/sales-operation/price-calculator", labelKey: "priceCalculator", page: "priceCalculator", icon: Calculator },
  { href: "/sales-operation/api-health-check", labelKey: "apiHealthCheck", page: "notes", icon: ShieldCheck },
  { href: "/sales-operation/call-center", labelKey: "callCenter", page: "salesCallCenter", icon: Phone },
  { href: "/sales-operation/settings", labelKey: "settings", page: "salesSettings", icon: Settings },
];

export function CommandPalette() {
  const router = useRouter();
  const t = useTranslations("salesOperation");
  const { canAccess } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const handle = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/sales-operation/search?q=${encodeURIComponent(query)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { ok?: boolean; results?: SearchResult[] };
        if (data.ok) setResults(data.results ?? []);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 220);
    return () => window.clearTimeout(handle);
  }, [open, query]);

  const nav = useMemo(
    () =>
      NAV_ITEMS.filter((item) => {
        if (item.href === "/sales-operation/settings") {
          return canAccess("salesSettings") || canAccess("accesses");
        }
        if (item.href === "/sales-operation/performance") return canAccess("salesSettings");
        return canAccess(item.page);
      }),
    [canAccess],
  );

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        type="button"
        aria-label={t("command.close")}
        className="so-overlay"
        onClick={() => setOpen(false)}
      />
      <div className="pointer-events-none fixed inset-0 z-[121] flex items-start justify-center p-4 pt-[12vh]">
        <Command
          label={t("command.placeholder")}
          className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-lg)]"
          shouldFilter={false}
        >
          <div className="flex items-center gap-2 border-b border-[var(--so-border)] px-3">
            <Search className="h-4 w-4 shrink-0 text-[var(--so-muted-2)]" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("command.placeholder")}
              className="h-11 w-full bg-transparent text-sm text-[var(--so-text)] outline-none placeholder:text-[var(--so-muted-2)]"
            />
            <Kbd>esc</Kbd>
          </div>
          <Command.List className="max-h-[22rem] overflow-y-auto p-2">
            <Command.Empty className="px-3 py-8 text-center text-sm text-[var(--so-muted)]">
              {searching ? t("search.searching") : t("command.empty")}
            </Command.Empty>

            {results.length > 0 ? (
              <Command.Group heading={t("command.search")} className="mb-2 text-[0.65rem] font-medium tracking-[0.01em] text-[var(--so-muted-2)]">
                {results.map((result) => (
                  <Command.Item
                    key={`${result.entityType}:${result.id}`}
                    value={`${result.title} ${result.subtitle ?? ""}`}
                    onSelect={() => go(result.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm text-[var(--so-text)] data-[selected=true]:bg-[var(--so-surface-hover)]"
                  >
                    <span className="min-w-0 flex-1 truncate">
                      <span className="block truncate font-medium">{result.title}</span>
                      {result.subtitle ? (
                        <span className="block truncate text-xs text-[var(--so-muted)]">{result.subtitle}</span>
                      ) : null}
                    </span>
                    <span className="text-[0.65rem] text-[var(--so-muted-2)]">
                      {t(`search.entity.${result.entityType}`)}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}

            <Command.Group heading={t("command.navigation")} className="mb-2 text-[0.65rem] font-medium tracking-[0.01em] text-[var(--so-muted-2)]">
              {nav.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    key={item.href}
                    value={t(`tab.${item.labelKey}`)}
                    onSelect={() => go(item.href)}
                    className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm text-[var(--so-text)] data-[selected=true]:bg-[var(--so-surface-hover)]"
                  >
                    <Icon className="h-4 w-4 text-[var(--so-muted)]" />
                    {t(`tab.${item.labelKey}`)}
                  </Command.Item>
                );
              })}
            </Command.Group>

            {canAccess("salesPipeline") ? (
              <Command.Group heading={t("command.actions")} className="text-[0.65rem] font-medium tracking-[0.01em] text-[var(--so-muted-2)]">
                <Command.Item
                  value={t("command.createLead")}
                  onSelect={() => go("/sales-operation/pipeline")}
                  className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm text-[var(--so-text)] data-[selected=true]:bg-[var(--so-surface-hover)]"
                >
                  <Plus className="h-4 w-4 text-[var(--so-muted)]" />
                  {t("command.createLead")}
                </Command.Item>
                <Command.Item
                  value={t("command.createTask")}
                  onSelect={() => go("/sales-operation/tasks")}
                  className="flex cursor-pointer items-center gap-2 rounded-[8px] px-2.5 py-2 text-sm text-[var(--so-text)] data-[selected=true]:bg-[var(--so-surface-hover)]"
                >
                  <Plus className="h-4 w-4 text-[var(--so-muted)]" />
                  {t("command.createTask")}
                </Command.Item>
              </Command.Group>
            ) : null}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
