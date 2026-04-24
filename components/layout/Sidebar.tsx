"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouteLoading } from "@/components/layout/RouteLoadingContext";
import type { AppPageKey } from "@/types/auth";

type IconProps = { className?: string };

function DashboardIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function OrdersIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="4" y="3" width="16" height="18" rx="2.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function CalendarIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3 10h18M8 14h3M13 14h3M8 18h3" />
    </svg>
  );
}

function CalculatorIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="5" y="3" width="14" height="18" rx="2.5" />
      <path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2M16 16h0" />
    </svg>
  );
}

function RideRequestIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M5 15l1.2-4A2.5 2.5 0 018.6 9h6.8a2.5 2.5 0 012.4 2l1.2 4" />
      <rect x="4" y="15" width="16" height="4" rx="1.5" />
      <circle cx="8" cy="19" r="1.2" />
      <circle cx="16" cy="19" r="1.2" />
    </svg>
  );
}

function ShieldIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 3l7 3v5c0 5-2.7 8-7 10-4.3-2-7-5-7-10V6l7-3z" />
      <path d="M9.5 12.5l1.8 1.8 3.3-3.3" />
    </svg>
  );
}

function NotesIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M15 3v4h4M9 11h6M9 15h6" />
    </svg>
  );
}

function ChevronRightIcon({ className = "h-3.5 w-3.5" }: IconProps) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} stroke="currentColor" strokeWidth="2">
      <path d="M7 4l6 6-6 6" />
    </svg>
  );
}

const navItems = [
  {
    href: "/request-rides",
    label: "Request Rides",
    page: "requestRides" as AppPageKey,
    area: "b2b" as const,
    icon: RideRequestIcon,
  },
  {
    href: "/pre-orders",
    label: "Pre-Orders",
    page: "preOrders" as AppPageKey,
    area: "b2b" as const,
    icon: CalendarIcon,
  },
  {
    href: "/orders",
    label: "Orders",
    page: "orders" as AppPageKey,
    area: "b2b" as const,
    icon: OrdersIcon,
  },
  {
    href: "/price-calculator",
    label: "Price Calculator",
    page: "priceCalculator" as AppPageKey,
    area: "b2b" as const,
    icon: CalculatorIcon,
  },
  {
    href: "/dashboard",
    label: "Dashboard",
    page: "dashboard" as AppPageKey,
    area: "b2b" as const,
    icon: DashboardIcon,
  },
];

const footerNavItems = [
  { href: "/accesses", label: "Access managment", page: "accesses" as AppPageKey, icon: ShieldIcon },
  { href: "/notes", label: "Notes", page: "notes" as AppPageKey, icon: NotesIcon },
];

export function Sidebar() {
  const pathname = usePathname();
  const { startRouteLoading } = useRouteLoading();
  const { canAccess, currentArea } = useAuth();
  const filteredNavItems = navItems.filter(
    (item) => item.area === currentArea && canAccess(item.page),
  );
  const filteredFooterNavItems = footerNavItems.filter((item) => canAccess(item.page));

  return (
    <div className="relative z-20 m-3 h-[calc(100vh-1.5rem)] w-20 shrink-0">
      <aside className="group crm-surface absolute left-0 top-0 h-full w-20 overflow-hidden rounded-3xl p-4 transition-[width] duration-200 ease-out hover:w-64">
        <div className="mb-6 border-b border-white/60 pb-4">
          <div className="flex justify-center group-hover:hidden">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/75 text-accent shadow-[0_8px_16px_rgba(15,23,42,0.12)]">
              <DashboardIcon className="h-4 w-4" />
            </div>
          </div>
          <div className="hidden group-hover:block">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Appli Taxi Oz
            </p>
            <p className="mt-1 text-base font-semibold text-slate-900">Operations</p>
          </div>
        </div>

        <nav className="space-y-1">
          {filteredNavItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                onClick={() => {
                  if (!pathname.startsWith(item.href)) {
                    startRouteLoading();
                  }
                }}
                className={`crm-hover-lift flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "crm-button-primary text-white"
                    : "bg-white/50 text-slate-700 hover:bg-white/80"
                }`}
              >
                <span className="flex min-w-0 flex-1 items-center justify-center gap-2.5 group-hover:justify-start">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="hidden truncate group-hover:block">{item.label}</span>
                </span>
                <ChevronRightIcon
                  className={`hidden h-3.5 w-3.5 shrink-0 group-hover:block ${isActive ? "text-white/85" : "text-slate-400"}`}
                />
              </Link>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-white/60 pt-4">
          <nav className="space-y-1">
            {filteredFooterNavItems.map((item) => {
              const isActive = pathname.startsWith(item.href);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={() => {
                    if (!pathname.startsWith(item.href)) {
                      startRouteLoading();
                    }
                  }}
                  className={`crm-hover-lift flex items-center rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                    isActive
                      ? "crm-button-primary text-white"
                      : "bg-white/50 text-slate-700 hover:bg-white/80"
                  }`}
                >
                  <span className="flex min-w-0 flex-1 items-center justify-center gap-2.5 group-hover:justify-start">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="hidden truncate group-hover:block">{item.label}</span>
                  </span>
                  <ChevronRightIcon
                    className={`hidden h-3.5 w-3.5 shrink-0 group-hover:block ${isActive ? "text-white/85" : "text-slate-400"}`}
                  />
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </div>
  );
}
