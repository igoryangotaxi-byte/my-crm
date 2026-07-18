"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  Building2,
  ChevronDown,
  Columns3,
  LayoutDashboard,
  LayoutGrid,
  LineChart,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Target,
  Users,
  Workflow,
} from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouteLoading } from "@/components/layout/RouteLoadingContext";
import { useTranslations } from "next-intl";
import type { AppPageKey } from "@/types/auth";
import { cn } from "@/lib/ui/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSalesSidebar } from "@/components/sales-operation/SalesSidebarContext";

type IconType = React.ComponentType<{ className?: string }>;

type NavLeaf = {
  kind: "leaf";
  href: string;
  labelKey: string;
  page: AppPageKey;
  icon: IconType;
  badge?: number;
};

type NavGroup = {
  kind: "group";
  id: string;
  labelKey: string;
  icon: IconType;
  children: Omit<NavLeaf, "kind">[];
};

type NavNode = NavLeaf | NavGroup;

export function SalesOperationSidebar() {
  const pathname = usePathname();
  const { startRouteLoading } = useRouteLoading();
  const tSales = useTranslations("salesOperation");
  const { language, canAccess } = useAuth();
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSalesSidebar();
  const rtl = language === "he";
  const [taskCount, setTaskCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/sales-operation/tasks?scope=mine&status=open", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { ok?: boolean; tasks?: unknown[] } | null) => {
        if (active && data?.ok && Array.isArray(data.tasks)) setTaskCount(data.tasks.length);
      })
      .catch(() => null);
    return () => {
      active = false;
    };
  }, []);

  const nav: NavNode[] = useMemo(
    () => [
      { kind: "leaf", href: "/sales-operation/tasks", labelKey: "mySpace", page: "salesPipeline", icon: LayoutGrid, badge: taskCount ?? undefined },
      { kind: "leaf", href: "/sales-operation/pipeline", labelKey: "pipeline", page: "salesPipeline", icon: Columns3 },
      { kind: "leaf", href: "/sales-operation/portfolio", labelKey: "portfolio", page: "salesSignedClients", icon: Briefcase },
      { kind: "leaf", href: "/sales-operation/b2b-clients", labelKey: "b2bClients", page: "salesB2BClients", icon: Building2 },
      {
        kind: "group",
        id: "analytics",
        labelKey: "analyticsGroup",
        icon: BarChart3,
        children: [
          { href: "/sales-operation/analytics", labelKey: "analyticsOverview", page: "salesAnalytics", icon: LineChart },
          { href: "/sales-operation/manager-analytics", labelKey: "managerAnalytics", page: "salesManagerAnalytics", icon: Users },
          { href: "/sales-operation/performance", labelKey: "performance", page: "salesSettings", icon: Target },
        ],
      },
      { kind: "leaf", href: "/sales-operation/automation", labelKey: "automation", page: "salesAutomation", icon: Workflow },
      { kind: "leaf", href: "/sales-operation/settings", labelKey: "settings", page: "salesSettings", icon: Settings },
    ],
    [taskCount],
  );

  const visibleNav = useMemo(
    () =>
      nav
        .map((node) => {
          if (node.kind === "leaf") return canAccess(node.page) ? node : null;
          const children = node.children.filter((c) => canAccess(c.page));
          return children.length ? { ...node, children } : null;
        })
        .filter(Boolean) as NavNode[],
    [nav, canAccess],
  );

  const showExpanded = !collapsed; // desktop expanded/pinned
  const mainCrmHref = "/request-rides";

  const onNavigate = (href: string) => {
    if (!pathname.startsWith(href)) startRouteLoading();
    setMobileOpen(false);
  };

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-[75] bg-[rgba(15,18,24,0.44)] lg:hidden"
        />
      ) : null}

      <aside
        aria-label="Sales Operation navigation"
        className={cn(
          "fixed inset-y-0 z-[80] flex h-screen flex-col border-[var(--so-border)] bg-[var(--so-surface)] transition-[width,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          rtl ? "right-0 border-l" : "left-0 border-r",
          collapsed ? "lg:w-[76px]" : "lg:w-[248px]",
          "w-[248px]",
          // Mobile: off-canvas unless open
          mobileOpen
            ? "translate-x-0"
            : rtl
              ? "translate-x-full lg:translate-x-0"
              : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Brand / back to CRM */}
        <div className="flex items-center gap-2.5 px-3.5 py-4">
          <Link
            href={mainCrmHref}
            onClick={() => onNavigate(mainCrmHref)}
            className="so-focus-ring flex min-w-0 items-center gap-2.5 rounded-xl"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[var(--so-accent)] text-white">
              <LayoutDashboard className="h-[18px] w-[18px]" />
            </span>
            {showExpanded ? (
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-[var(--so-text)]">
                  {tSales("sectionLabel")}
                </span>
                <span className="block truncate text-xs text-[var(--so-muted)]">
                  {tSales("backToCrm")}
                </span>
              </span>
            ) : null}
          </Link>
        </div>

        <div className="mx-3.5 mb-1 h-px bg-[var(--so-border)]" />

        {/* Nav */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-2">
          {visibleNav.map((node) =>
            node.kind === "leaf" ? (
              <NavLink
                key={node.href}
                node={node}
                active={pathname.startsWith(node.href)}
                collapsed={collapsed}
                label={tSales(`tab.${node.labelKey}`)}
                onNavigate={onNavigate}
              />
            ) : (
              <NavGroupItem
                key={node.id}
                group={node}
                pathname={pathname}
                collapsed={collapsed}
                t={tSales}
                onNavigate={onNavigate}
              />
            ),
          )}
        </nav>

        {/* Collapse toggle (desktop only) */}
        <div className="hidden border-t border-[var(--so-border)] p-2.5 lg:block">
          <button
            type="button"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="so-focus-ring flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium text-[var(--so-muted)] transition-colors hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]"
          >
            {collapsed ? (
              <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
            ) : (
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
            )}
            {showExpanded ? <span>{tSales("collapse")}</span> : null}
          </button>
        </div>
      </aside>
    </>
  );
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--so-accent-soft)] px-1.5 text-[0.6875rem] font-bold text-[var(--so-accent-strong)]">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NavLink({
  node,
  active,
  collapsed,
  label,
  onNavigate,
}: {
  node: NavLeaf;
  active: boolean;
  collapsed: boolean;
  label: string;
  onNavigate: (href: string) => void;
}) {
  const Icon = node.icon;
  const content = (
    <Link
      href={node.href}
      aria-current={active ? "page" : undefined}
      onClick={() => onNavigate(node.href)}
      className={cn(
        "so-focus-ring group relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium transition-colors",
        collapsed ? "lg:justify-center" : "",
        active
          ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
          : "text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
      )}
    >
      {active ? (
        <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[var(--so-accent)] lg:block" />
      ) : null}
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {!collapsed ? <span className="flex-1 truncate">{label}</span> : null}
      {!collapsed && node.badge ? <Badge count={node.badge} /> : null}
    </Link>
  );

  if (collapsed) {
    return (
      <div className="hidden lg:block">
        <Tooltip content={label} side="right">
          {content}
        </Tooltip>
      </div>
    );
  }
  return content;
}

function NavGroupItem({
  group,
  pathname,
  collapsed,
  t,
  onNavigate,
}: {
  group: NavGroup;
  pathname: string;
  collapsed: boolean;
  t: (key: string) => string;
  onNavigate: (href: string) => void;
}) {
  const childActive = group.children.some((c) => pathname.startsWith(c.href));
  const [open, setOpen] = useState(childActive);
  const Icon = group.icon;
  const label = t(`tab.${group.labelKey}`);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  // Collapsed rail: show group icon; tooltip lists it, clicking goes to first child.
  if (collapsed) {
    const first = group.children[0];
    return (
      <div className="hidden lg:block">
        <Tooltip content={label} side="right">
          <Link
            href={first?.href ?? "#"}
            onClick={() => first && onNavigate(first.href)}
            aria-current={childActive ? "page" : undefined}
            className={cn(
              "so-focus-ring flex items-center justify-center rounded-[10px] px-2.5 py-2 transition-colors",
              childActive
                ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                : "text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
            )}
          >
            <Icon className="h-[18px] w-[18px]" />
          </Link>
        </Tooltip>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={cn(
          "so-focus-ring flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-sm font-medium transition-colors",
          childActive && !open
            ? "text-[var(--so-accent-strong)]"
            : "text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
        )}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        <ChevronDown
          className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 pl-3.5">
            {group.children.map((child) => {
              const active = pathname.startsWith(child.href);
              return (
                <Link
                  key={child.href}
                  href={child.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => onNavigate(child.href)}
                  className={cn(
                    "so-focus-ring relative flex items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
                      : "text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
                  )}
                >
                  <span
                    className={cn(
                      "h-1.5 w-1.5 shrink-0 rounded-full",
                      active ? "bg-[var(--so-accent)]" : "bg-[var(--so-border-strong)]",
                    )}
                  />
                  <span className="truncate">{t(`tab.${child.labelKey}`)}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
