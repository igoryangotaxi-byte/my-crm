"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouteLoading } from "@/components/layout/RouteLoadingContext";
import { useTranslations } from "next-intl";

type IconProps = { className?: string };

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

function WalletIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M4 7.5A2.5 2.5 0 016.5 5H18a2 2 0 012 2v2H8a2.5 2.5 0 100 5h12v2a2 2 0 01-2 2H6.5A2.5 2.5 0 014 15.5z" />
      <path d="M20 9v5H8a2.5 2.5 0 010-5h12z" />
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

const gettItems = [
  { href: "/gett/request-rides", label: "Request Rides", icon: RideRequestIcon },
  { href: "/gett/pre-orders", label: "Pre-Orders", icon: CalendarIcon },
  { href: "/gett/orders", label: "Orders", icon: OrdersIcon },
  { href: "/gett/bussiness-center", label: "Bussiness Center", icon: WalletIcon },
];

export function GettSidebar() {
  const pathname = usePathname();
  const { startRouteLoading } = useRouteLoading();
  const tNav = useTranslations("nav");
  const { language } = useAuth();
  const rtl = language === "he";
  const navLabelReveal =
    "min-w-0 overflow-hidden text-sm font-medium transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-w-0 -translate-x-1 opacity-0 group-hover:max-w-[13rem] group-hover:translate-x-0 group-hover:opacity-100";

  return (
    <aside
      className={`group fixed top-0 z-[70] flex h-screen w-16 max-w-[min(16rem,calc(100vw-0.5rem))] flex-col overflow-y-auto overflow-x-hidden border-amber-100 bg-white p-4 shadow-xl transition-[width] duration-300 hover:w-64 ${
        rtl ? "right-0 rounded-l-3xl border-l" : "left-0 rounded-r-3xl border-r"
      }`}
    >
      <Link
        href="/request-rides"
        onClick={() => {
          if (!pathname.startsWith("/request-rides")) startRouteLoading();
        }}
        className="mb-7 flex w-full min-w-0 items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-[0_10px_26px_rgba(251,183,38,0.5)]">
          <RideRequestIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden transition-[max-width,opacity] duration-300 ease-out max-w-0 opacity-0 group-hover:max-w-[11rem] group-hover:opacity-100">
          <p className="truncate text-lg font-semibold text-slate-900">Appli Gett Oz</p>
          <p className="truncate text-xs text-slate-600">{tNav("operations")}</p>
        </div>
      </Link>

      <nav className="flex flex-col gap-2.5">
        {gettItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => {
                if (!pathname.startsWith(item.href)) startRouteLoading();
              }}
              className={`group/nav flex w-full items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 ease-out group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3 ${
                isActive
                  ? "group-hover:bg-gradient-to-r group-hover:from-amber-300 group-hover:to-amber-400 group-hover:shadow-lg group-hover:shadow-amber-300/45"
                  : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  isActive
                    ? "border border-amber-200/70 bg-gradient-to-br from-amber-400 to-amber-500 text-slate-900 shadow-[0_10px_28px_rgba(251,183,38,0.45)]"
                    : "border border-white/70 bg-white text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.1)]"
                }`}
              >
                <Icon className="h-5 w-5" />
              </span>
              <span className={`truncate whitespace-nowrap ${navLabelReveal} ${isActive ? "text-slate-900" : "text-slate-800"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
