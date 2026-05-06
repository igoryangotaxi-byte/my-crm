"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouteLoading } from "@/components/layout/RouteLoadingContext";
import type { AppPageKey } from "@/types/auth";
import { useTranslations } from "next-intl";

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

function WalletIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5A2.5 2.5 0 016.5 5H18a2 2 0 012 2v2H8a2.5 2.5 0 100 5h12v2a2 2 0 01-2 2H6.5A2.5 2.5 0 014 15.5z" />
      <path d="M20 9v5H8a2.5 2.5 0 010-5h12z" />
      <circle cx="16" cy="11.5" r="0.8" fill="currentColor" stroke="none" />
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

function DriversMapIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M12 21s7-5.7 7-11a7 7 0 10-14 0c0 5.3 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.4" />
      <path d="M4 17l3-1.2L11 18l4-1.2 5 1.7" />
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

function CommunicationsIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7A2.5 2.5 0 0117.5 16H10l-4.5 4v-4H6.5A2.5 2.5 0 014 13.5z" />
      <path d="M8 8.5h8M8 11.5h5" />
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
    href: "/communications",
    label: "Communications",
    page: "communications" as AppPageKey,
    area: "b2b" as const,
    icon: CommunicationsIcon,
  },
  {
    href: "/bussiness-center",
    label: "Bussiness Center",
    page: "financialCenter" as AppPageKey,
    area: "b2b" as const,
    icon: WalletIcon,
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
  {
    href: "/drivers-map",
    label: "Drivers on the Map",
    page: "driversMap" as AppPageKey,
    area: "b2c" as const,
    icon: DriversMapIcon,
  },
];

const footerNavItems = [
  { href: "/accesses", label: "Access managment", page: "accesses" as AppPageKey, icon: ShieldIcon },
  { href: "/notes", label: "Notes", page: "notes" as AppPageKey, icon: NotesIcon },
];

function translateNavLabel(label: string, tNav: (key: string) => string) {
  const map: Record<string, string> = {
    "Request Rides": tNav("requestRides"),
    "Pre-Orders": tNav("preOrders"),
    Orders: tNav("orders"),
    Communications: tNav("communications"),
    "Bussiness Center": tNav("bussinessCenter"),
    "Price Calculator": tNav("priceCalculator"),
    Dashboard: tNav("dashboard"),
    "Drivers on the Map": tNav("driversMap"),
    "Access managment": tNav("accesses"),
    Notes: tNav("notes"),
    Employees: tNav("employees"),
  };
  return map[label] ?? label;
}

export function Sidebar() {
  const tLayout = useTranslations("layout");
  const tNav = useTranslations("nav");
  const pathname = usePathname();
  const { startRouteLoading } = useRouteLoading();
  const { canAccess, currentArea, currentUser, language } = useAuth();
  const isClientPortal = pathname.startsWith("/client");
  const mainNavItems = isClientPortal
    ? [
        { href: "/client/request-rides", label: "Request Rides", page: "requestRides" as AppPageKey, area: "b2b" as const, icon: RideRequestIcon },
        { href: "/client/pre-orders", label: "Pre-Orders", page: "preOrders" as AppPageKey, area: "b2b" as const, icon: CalendarIcon },
        { href: "/client/orders", label: "Orders", page: "orders" as AppPageKey, area: "b2b" as const, icon: OrdersIcon },
        { href: "/client/communications", label: "Communications", page: "communications" as AppPageKey, area: "b2b" as const, icon: CommunicationsIcon },
        { href: "/client/financial-center", label: "Bussiness Center", page: "financialCenter" as AppPageKey, area: "b2b" as const, icon: WalletIcon },
        { href: "/client/drivers-map", label: "Drivers on the Map", page: "driversMap" as AppPageKey, area: "b2c" as const, icon: DriversMapIcon },
        { href: "/client/employees", label: "Employees", page: "orders" as AppPageKey, area: "b2b" as const, icon: ShieldIcon },
      ]
    : navItems;
  const filteredNavItems = mainNavItems.filter(
    (item) => item.area === currentArea && canAccess(item.page),
  );
  const filteredFooterNavItems = isClientPortal
    ? []
    : footerNavItems.filter((item) => canAccess(item.page));

  const navIconWellActive =
    "border border-white/25 bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_10px_28px_rgba(239,68,68,0.45)]";
  const activeNavBackground =
    "group-hover:bg-gradient-to-r group-hover:from-red-500 group-hover:to-red-600 group-hover:shadow-lg group-hover:shadow-red-500/45";
  const logoHref = "/gett/request-rides";
  const logoGradient = "from-red-500 to-red-700 text-white";
  const logoShadow = "shadow-[0_10px_26px_rgba(239,68,68,0.5)]";
  const logoBrand = tLayout("brand");
  const navIconWellInactive =
    "border border-white/70 bg-white/95 text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.1)]";

  const navLabelReveal =
    "min-w-0 overflow-hidden text-sm font-medium transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-w-0 -translate-x-1 opacity-0 group-hover:max-w-[13rem] group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none";
  const rtl = language === "he";

  return (
    <aside
      className={`group fixed top-0 z-[70] flex h-screen w-16 max-w-[min(16rem,calc(100vw-0.5rem))] translate-y-0 scale-100 flex-col overflow-y-auto overflow-x-hidden border-white/40 bg-white/35 p-4 shadow-2xl shadow-black/10 backdrop-blur-3xl transition-[width,transform,box-shadow] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] [scrollbar-width:thin] motion-reduce:transition-none hover:w-64 hover:-translate-y-1 hover:scale-[1.012] hover:shadow-[0_28px_64px_rgba(15,23,42,0.22)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 ${
        rtl
          ? "right-0 origin-top-right rounded-l-3xl border-l"
          : "left-0 origin-top-left rounded-r-3xl border-r"
      }`}
      aria-label="Main navigation"
    >
      <Link
        href={logoHref}
        onClick={() => {
          if (!pathname.startsWith(logoHref)) {
            startRouteLoading();
          }
        }}
        className="mb-7 flex w-full min-w-0 items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 ease-out group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3"
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${logoGradient} ${logoShadow}`}>
          <DashboardIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden transition-[max-width,opacity] duration-300 ease-out max-w-0 opacity-0 group-hover:max-w-[11rem] group-hover:opacity-100 motion-reduce:transition-none">
          <p className="truncate text-lg font-semibold text-slate-900">{logoBrand}</p>
          <p className="truncate text-xs text-slate-600">
            {currentUser?.accountType === "client" ? tNav("clientCabinet") : tNav("operations")}
          </p>
        </div>
      </Link>

      <nav className="flex flex-col gap-2.5">
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
              className={`group/nav flex w-full items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 ease-out group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3 ${
                isActive
                  ? activeNavBackground
                  : "hover:bg-white/45"
              }`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 ease-out group-hover/nav:translate-x-0.5 ${isActive ? navIconWellActive : navIconWellInactive}`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span
                className={`truncate whitespace-nowrap ${navLabelReveal} ${
                  isActive ? "text-white group-hover:text-white" : "text-slate-800"
                }`}
              >
                {translateNavLabel(item.label, tNav)}
              </span>
            </Link>
          );
        })}
      </nav>

      {filteredFooterNavItems.length > 0 ? (
        <div className="mt-4 border-t border-white/35 pt-4">
          <nav className="flex flex-col gap-2.5">
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
                  className={`group/nav flex w-full items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 ease-out group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3 ${
                    isActive
                      ? activeNavBackground
                      : "hover:bg-white/45"
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 ease-out group-hover/nav:translate-x-0.5 ${isActive ? navIconWellActive : navIconWellInactive}`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span
                    className={`truncate whitespace-nowrap ${navLabelReveal} ${
                      isActive ? "text-white group-hover:text-white" : "text-slate-800"
                    }`}
                  >
                    {translateNavLabel(item.label, tNav)}
                  </span>
                </Link>
              );
            })}
          </nav>
        </div>
      ) : null}
    </aside>
  );
}
