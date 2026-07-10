"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { useRouteLoading } from "@/components/layout/RouteLoadingContext";
import { useTranslations } from "next-intl";
import type { AppPageKey } from "@/types/auth";

type IconProps = { className?: string };

function CrmBackIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function PipelineIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="5" width="5" height="14" rx="1.5" />
      <rect x="9.5" y="5" width="5" height="10" rx="1.5" />
      <rect x="16" y="5" width="5" height="6" rx="1.5" />
    </svg>
  );
}

function ClientsIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <circle cx="9" cy="8" r="3" />
      <path d="M3 19c0-3 2.7-5 6-5s6 2 6 5" />
      <circle cx="17" cy="9" r="2.2" />
      <path d="M15.5 19c.3-2.2 1.8-3.5 4-3.5" />
    </svg>
  );
}

function AnalyticsIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <path d="M4 19V5M4 19h16" />
      <path d="M8 16V11M12 16V7M16 16v-4" strokeLinecap="round" />
    </svg>
  );
}

function B2BOverviewIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="1.8">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 4v16M16 4v16" />
    </svg>
  );
}

const salesOperationItems: Array<{
  href: string;
  labelKey: "pipeline" | "clients" | "b2bClients" | "analytics" | "managerAnalytics";
  page: AppPageKey;
  icon: React.ComponentType<IconProps>;
}> = [
  { href: "/sales-operation/pipeline", labelKey: "pipeline", page: "salesPipeline", icon: PipelineIcon },
  { href: "/sales-operation/clients", labelKey: "clients", page: "salesSignedClients", icon: ClientsIcon },
  {
    href: "/sales-operation/b2b-clients",
    labelKey: "b2bClients",
    page: "salesB2BClients",
    icon: B2BOverviewIcon,
  },
  { href: "/sales-operation/analytics", labelKey: "analytics", page: "salesAnalytics", icon: AnalyticsIcon },
  {
    href: "/sales-operation/manager-analytics",
    labelKey: "managerAnalytics",
    page: "salesManagerAnalytics",
    icon: AnalyticsIcon,
  },
];

export function SalesOperationSidebar() {
  const pathname = usePathname();
  const { startRouteLoading } = useRouteLoading();
  const tLayout = useTranslations("layout");
  const tSales = useTranslations("salesOperation");
  const { language, canAccess } = useAuth();
  const rtl = language === "he";
  const mainCrmHref = "/request-rides";

  const navIconWellActive =
    "border border-white/25 bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_10px_28px_rgba(239,68,68,0.45)]";
  const activeNavBackground =
    "group-hover:bg-gradient-to-r group-hover:from-red-500 group-hover:to-red-600 group-hover:shadow-lg group-hover:shadow-red-500/45";
  const navIconWellInactive =
    "border border-white/70 bg-white/95 text-slate-700 shadow-[0_6px_18px_rgba(15,23,42,0.1)]";
  const navLabelReveal =
    "min-w-0 overflow-hidden text-sm font-medium transition-[max-width,opacity,transform] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] max-w-0 -translate-x-1 opacity-0 group-hover:max-w-[13rem] group-hover:translate-x-0 group-hover:opacity-100 motion-reduce:transition-none";

  return (
    <aside
      className={`group fixed top-0 z-[70] flex h-screen w-16 max-w-[min(16rem,calc(100vw-0.5rem))] flex-col overflow-y-auto overflow-x-hidden border-white/40 bg-white/35 p-4 shadow-2xl shadow-black/10 backdrop-blur-3xl transition-[width,transform,box-shadow] duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] [scrollbar-width:thin] motion-reduce:transition-none hover:w-64 hover:-translate-y-1 hover:scale-[1.012] hover:shadow-[0_28px_64px_rgba(15,23,42,0.22)] motion-reduce:hover:translate-y-0 motion-reduce:hover:scale-100 ${
        rtl
          ? "right-0 origin-top-right rounded-l-3xl border-l"
          : "left-0 origin-top-left rounded-r-3xl border-r"
      }`}
      aria-label="Sales Operation navigation"
    >
      <Link
        href={mainCrmHref}
        onClick={() => {
          if (!pathname.startsWith(mainCrmHref)) startRouteLoading();
        }}
        className="mb-7 flex w-full min-w-0 items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 ease-out group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-red-700 text-white shadow-[0_10px_26px_rgba(239,68,68,0.5)]">
          <CrmBackIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1 overflow-hidden transition-[max-width,opacity] duration-300 ease-out max-w-0 opacity-0 group-hover:max-w-[11rem] group-hover:opacity-100 motion-reduce:transition-none">
          <p className="truncate text-lg font-semibold text-slate-900">{tLayout("brand")}</p>
          <p className="truncate text-xs text-slate-600">{tSales("backToCrm")}</p>
        </div>
      </Link>

      <p className="crm-label mb-2 hidden px-1 text-[0.62rem] tracking-[0.14em] group-hover:block">
        {tSales("sectionLabel")}
      </p>

      <nav className="flex flex-col gap-2.5">
        {salesOperationItems
          .filter((item) => canAccess(item.page))
          .map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              title={tSales(`tab.${item.labelKey}`)}
              onClick={() => {
                if (!pathname.startsWith(item.href)) startRouteLoading();
              }}
              className={`group/nav flex w-full items-center justify-center gap-0 rounded-2xl py-1.5 pl-1.5 pr-1.5 transition-all duration-300 ease-out group-hover:justify-start group-hover:gap-3 group-hover:py-2 group-hover:pr-3 ${
                isActive ? activeNavBackground : "hover:bg-white/45"
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
                {tSales(`tab.${item.labelKey}`)}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
