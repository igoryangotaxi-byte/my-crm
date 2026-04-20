"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppPageKey } from "@/types/auth";

const navItems = [
  { href: "/dashboard", label: "Dashboard", page: "dashboard" as AppPageKey },
  { href: "/pre-orders", label: "Pre-Orders", page: "preOrders" as AppPageKey },
  {
    href: "/price-calculator",
    label: "Price Calculator",
    page: "priceCalculator" as AppPageKey,
  },
];

const footerNavItems = [
  { href: "/accesses", label: "Accesses", page: "accesses" as AppPageKey },
];

export function Sidebar() {
  const pathname = usePathname();
  const { canAccess } = useAuth();
  const filteredNavItems = navItems.filter((item) => canAccess(item.page));
  const filteredFooterNavItems = footerNavItems.filter((item) => canAccess(item.page));

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-panel p-4">
      <div className="mb-6 border-b border-border pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Appli Taxi Oz
        </p>
        <p className="mt-1 text-base font-semibold text-foreground">Operations</p>
      </div>

      <nav className="space-y-1">
        {filteredNavItems.map((item) => {
          const isActive = pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-100 text-foreground"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{item.label}</span>
              <span className="text-xs text-slate-400">›</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-6 border-t border-border pt-4">
        <nav className="space-y-1">
          {filteredFooterNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-slate-100 text-foreground"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-xs text-slate-400">›</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
