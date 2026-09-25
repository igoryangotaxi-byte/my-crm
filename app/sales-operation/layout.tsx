"use client";

import "./sales-operation.css";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { NoAccessState } from "@/components/auth/NoAccessState";
import { SalesOperationAppShell } from "@/components/sales-operation/SalesOperationAppShell";
import { buildLoginHref } from "@/lib/login-redirect";
import {
  canAccessSalesOperationPath,
  firstAllowedLegacyCrmPath,
  hasAnyAllowedPage,
  resolveSalesOperationPageKey,
} from "@/lib/role-permissions";

export default function SalesOperationLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, currentUser, canAccess } = useAuth();

  const pathAllowed =
    canAccess("salesOperation") && canAccessSalesOperationPath(pathname, canAccess);

  useEffect(() => {
    if (loading) return;

    if (!currentUser || currentUser.status !== "approved") {
      const returnPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : pathname;
      router.replace(buildLoginHref(returnPath));
      return;
    }

    if (currentUser.accountType === "client") {
      router.replace("/client/request-rides");
      return;
    }

    if (!hasAnyAllowedPage(canAccess)) {
      return;
    }

    if (!canAccess("salesOperation")) {
      const legacy = firstAllowedLegacyCrmPath(canAccess);
      router.replace(legacy ?? buildLoginHref(pathname));
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

  if (!canAccess("salesOperation")) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Redirecting...
      </div>
    );
  }

  if (!pathAllowed) {
    return <NoAccessState permission={resolveSalesOperationPageKey(pathname)} />;
  }

  if (pathname.startsWith("/sales-operation/corp-register")) {
    return <div className="bg-white">{children}</div>;
  }

  return <SalesOperationAppShell>{children}</SalesOperationAppShell>;
}
