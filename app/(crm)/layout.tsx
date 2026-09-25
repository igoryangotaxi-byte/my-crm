"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { NoAccessState } from "@/components/auth/NoAccessState";
import { AppShell } from "@/components/layout/AppShell";
import { buildLoginHref } from "@/lib/login-redirect";
import { firstAllowedSalesOperationPath, hasAnyAllowedPage } from "@/lib/role-permissions";
import type { AppPageKey } from "@/types/auth";

function resolvePageKey(pathname: string): AppPageKey {
  if (pathname.startsWith("/clients")) return "clients";
  if (pathname.startsWith("/orders")) return "orders";
  if (pathname.startsWith("/pre-orders")) return "preOrders";
  if (pathname.startsWith("/request-rides")) return "requestRides";
  if (pathname.startsWith("/communications")) return "communications";
  if (pathname.startsWith("/bussiness-center")) return "financialCenter";
  if (pathname.startsWith("/drivers-map")) return "driversMap";
  if (pathname.startsWith("/heat-map")) return "heatMap";
  if (pathname.startsWith("/price-calculator")) return "priceCalculator";
  if (pathname.startsWith("/accesses")) return "accesses";
  if (pathname.startsWith("/notes")) return "notes";
  return "dashboard";
}

export default function CrmLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, currentUser, canAccess } = useAuth();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!currentUser) {
      const returnPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : pathname;
      router.replace(buildLoginHref(returnPath));
      return;
    }

    if (currentUser.status !== "approved") {
      router.replace("/login");
      return;
    }
    if (currentUser.accountType === "client") {
      router.replace("/client/request-rides");
      return;
    }

    if (!hasAnyAllowedPage(canAccess)) {
      return;
    }

    if (pathname.startsWith("/clients")) {
      return;
    }

    const soPath = firstAllowedSalesOperationPath(canAccess);
    if (soPath && canAccess("salesOperation")) {
      const pageKey = resolvePageKey(pathname);
      if (!canAccess(pageKey)) {
        router.replace(soPath);
      }
      return;
    }

    const pageKey = resolvePageKey(pathname);
    if (!canAccess(pageKey)) {
      router.replace(soPath ?? buildLoginHref(pathname));
    }
  }, [loading, currentUser, canAccess, pathname, router]);

  if (loading || !currentUser || currentUser.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Checking access...
      </div>
    );
  }
  if (currentUser.accountType === "client") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Redirecting...
      </div>
    );
  }

  if (!hasAnyAllowedPage(canAccess)) {
    return <NoAccessState permission={null} />;
  }

  if (pathname.startsWith("/clients")) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Redirecting...
      </div>
    );
  }

  if (!canAccess(resolvePageKey(pathname))) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Redirecting...
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
