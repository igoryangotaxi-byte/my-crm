 "use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import type { AppPageKey, BusinessArea } from "@/types/auth";
import { useTranslations } from "next-intl";

const pageMeta: Record<string, { title: string; subtitle: string }> = {
  "/dashboard": {
    title: "Dashboard",
    subtitle: "B2B pre-orders analytics",
  },
  "/clients": {
    title: "Clients",
    subtitle: "Manage your client base",
  },
  "/orders": {
    title: "Orders",
    subtitle: "B2B orders with filters and details",
  },
  "/pre-orders": {
    title: "Pre-Orders",
    subtitle: "Upcoming scheduled rides from Yango API",
  },
  "/price-calculator": {
    title: "Price Calculator",
    subtitle: "Estimate Taximeter by MOT and Yango Tariff",
  },
  "/request-rides": {
    title: "Request Rides",
    subtitle: "Create ride requests via selected client API",
  },
  "/communications": {
    title: "Communications",
    subtitle: "Send messages to client employees",
  },
  "/bussiness-center": {
    title: "Bussiness Center",
    subtitle: "Spend analytics by selected client with cached data",
  },
  "/client/request-rides": {
    title: "Request Rides",
    subtitle: "Client cabinet ride requests",
  },
  "/client/communications": {
    title: "Communications",
    subtitle: "Send messages to your employees",
  },
  "/client/pre-orders": {
    title: "Pre-Orders",
    subtitle: "Upcoming scheduled rides for your company",
  },
  "/client/orders": {
    title: "Orders",
    subtitle: "All rides for your client account",
  },
  "/client/financial-center": {
    title: "Bussiness Center",
    subtitle: "Spend analytics for your cabinet only",
  },
  "/client/employees": {
    title: "My Employees",
    subtitle: "Team members, ride activity and restrictions",
  },
  "/accesses": {
    title: "Access managment",
    subtitle: "Manage role permissions and registration approvals",
  },
  "/notes": {
    title: "Notes",
    subtitle: "Token diagnostics and release notes",
  },
};

export function Header() {
  const tLayout = useTranslations("layout");
  const tLanguage = useTranslations("language");
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout, currentArea, setCurrentArea, canAccessArea, canAccess, language, updateUserLanguage } =
    useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const pageMetaByLocale: Record<"en" | "he", Record<string, { title: string; subtitle: string }>> = {
    en: pageMeta,
    he: {
      "/dashboard": { title: "לוח בקרה", subtitle: "ניתוח הזמנות מתוכננות B2B" },
      "/clients": { title: "לקוחות", subtitle: "ניהול בסיס הלקוחות" },
      "/orders": { title: "הזמנות", subtitle: "הזמנות B2B עם סינון ופרטים" },
      "/pre-orders": { title: "הזמנות מוקדמות", subtitle: "נסיעות מתוכננות מ-Yango API" },
      "/price-calculator": { title: "מחשבון מחיר", subtitle: "הערכת Taximeter לפי MOT ותעריף Yango" },
      "/request-rides": { title: "הזמנת נסיעות", subtitle: "יצירת הזמנת נסיעה דרך לקוח API נבחר" },
      "/communications": { title: "תקשורת", subtitle: "שליחת הודעות לעובדי לקוח" },
      "/bussiness-center": { title: "מרכז עסקי", subtitle: "ניתוח הוצאות לפי לקוח נבחר עם cache" },
      "/client/request-rides": { title: "הזמנת נסיעות", subtitle: "הזמנות נסיעה בפורטל לקוח" },
      "/client/communications": { title: "תקשורת", subtitle: "שליחת הודעות לעובדים שלך" },
      "/client/pre-orders": { title: "הזמנות מוקדמות", subtitle: "נסיעות מתוכננות לחברה שלך" },
      "/client/orders": { title: "הזמנות", subtitle: "כל הנסיעות לחשבון הלקוח שלך" },
      "/client/financial-center": { title: "מרכז עסקי", subtitle: "ניתוח הוצאות לפורטל הזה בלבד" },
      "/client/employees": { title: "העובדים שלי", subtitle: "חברי צוות, פעילות נסיעות והגבלות" },
      "/accesses": { title: "ניהול הרשאות", subtitle: "ניהול הרשאות תפקיד ואישורי הרשמה" },
      "/notes": { title: "הערות", subtitle: "דיאגנוסטיקת טוקנים ורשימות שחרור" },
    },
  };
  const pageRoute =
    Object.keys(pageMeta).find((route) => pathname.startsWith(route)) ??
    "/dashboard";
  const currentPage = pageMetaByLocale[language][pageRoute] ?? pageMeta[pageRoute];
  const avatarText =
    currentUser?.name
      ?.split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "AO";
  const isClientCabinet = currentUser?.accountType === "client";
  const areaToggleItems: Array<{ key: BusinessArea; label: string }> = isClientCabinet
    ? [{ key: "b2b", label: "B2B" }]
    : [
        { key: "b2b", label: "B2B" },
        { key: "b2c", label: "B2C" },
      ];

  const areaLandingCandidates: Record<BusinessArea, Array<{ page: AppPageKey; path: string }>> = {
    b2b: [
      { page: "requestRides", path: "/request-rides" },
      { page: "dashboard", path: "/dashboard" },
      { page: "orders", path: "/orders" },
      { page: "preOrders", path: "/pre-orders" },
      { page: "priceCalculator", path: "/price-calculator" },
    ],
    b2c: [{ page: "driversMap", path: "/drivers-map" }],
  };

  const resolveAreaLandingPath = (area: BusinessArea): string => {
    const prefix = pathname.startsWith("/client") ? "/client" : "";
    const candidate = areaLandingCandidates[area].find((item) => canAccess(item.page));
    if (candidate) return `${prefix}${candidate.path}`;
    return area === "b2c" ? `${prefix}/drivers-map` : `${prefix}/request-rides`;
  };

  const mapFullBleed =
    pathname === "/request-rides" || pathname.startsWith("/client/request-rides");

  return (
    <header
      className={`crm-surface sticky top-3 z-20 mb-2 flex min-h-16 shrink-0 items-center justify-between rounded-2xl border-white/70 px-5 py-3 lg:px-6 ${
        mapFullBleed
          ? language === "he"
            ? "mr-[calc(0.75rem+4rem)] ml-3"
            : "ml-[calc(0.75rem+4rem)] mr-3"
          : "mx-3"
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0">
          <p className="crm-label mb-0.5 text-[0.62rem] tracking-[0.14em] text-muted">{tLayout("brand")}</p>
          <h1 className="truncate text-lg font-bold tracking-tight text-foreground sm:text-xl">{currentPage.title}</h1>
          <p className="crm-subtitle mt-0.5 line-clamp-2 max-sm:text-[0.8rem]">{currentPage.subtitle}</p>
        </div>
      </div>

      <div className="mx-4 hidden w-full max-w-2xl items-center gap-3 lg:flex">
        <input
          type="search"
          placeholder={tLayout("searchPlaceholder")}
          className="crm-input h-10 w-full px-3 text-sm"
        />
        <div className="inline-flex rounded-full border border-white/70 bg-white/75 p-1 shadow-[0_8px_18px_rgba(15,23,42,0.14)]">
          {areaToggleItems.map((item) => {
            const allowed = canAccessArea(item.key);
            const active = currentArea === item.key;
            return (
              <button
                key={item.key}
                type="button"
                disabled={!allowed}
                onClick={() => {
                  if (currentArea === item.key) return;
                  setCurrentArea(item.key);
                  const targetPath = resolveAreaLandingPath(item.key);
                  if (!pathname.startsWith(targetPath)) {
                    router.push(targetPath);
                  }
                }}
                className={`rounded-full border px-4 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-red-200 bg-red-50 text-red-700 shadow-[0_8px_16px_rgba(239,68,68,0.15)]"
                    : "border-transparent text-slate-700 hover:bg-white"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                <span
                  className={`inline-block border-b-2 pb-0.5 ${
                    active ? "border-red-500" : "border-transparent"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
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
              <p className="mt-1 text-xs text-slate-600">
                {tLayout("role")}: {currentUser?.role ?? tLayout("na")}
              </p>
              <div className="mt-3">
                <p className="text-xs text-muted">{tLayout("language")}</p>
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateUserLanguage("en")}
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                      language === "en" ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {tLanguage("en")}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateUserLanguage("he")}
                    className={`rounded-lg border px-2 py-1 text-xs font-semibold ${
                      language === "he" ? "border-red-300 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {tLanguage("he")}
                  </button>
                </div>
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
          {isUserMenuOpen ? (
            <button
              type="button"
              aria-label={tLayout("closeUserMenuOverlay")}
              onClick={() => setIsUserMenuOpen(false)}
              className="fixed inset-0 z-[-1] cursor-default"
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
