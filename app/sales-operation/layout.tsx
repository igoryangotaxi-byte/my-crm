"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { SalesOperationAppShell } from "@/components/sales-operation/SalesOperationAppShell";
import {
  firstAllowedSalesOperationPath,
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

  useEffect(() => {
    if (loading) return;

    if (!currentUser || currentUser.status !== "approved") {
      router.replace("/login");
      return;
    }

    if (currentUser.accountType === "client") {
      router.replace("/client/request-rides");
      return;
    }

    if (!canAccess("salesOperation")) {
      router.replace("/request-rides");
      return;
    }

    const pageKey = resolveSalesOperationPageKey(pathname);
    if (!canAccess(pageKey)) {
      const fallback = firstAllowedSalesOperationPath(canAccess);
      router.replace(fallback ?? "/request-rides");
    }
  }, [loading, currentUser, canAccess, pathname, router]);

  if (loading || !currentUser || currentUser.status !== "approved") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Checking access...
      </div>
    );
  }

  if (currentUser.accountType === "client" || !canAccess("salesOperation")) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Redirecting...
      </div>
    );
  }

  const pageKey = resolveSalesOperationPageKey(pathname);
  if (!canAccess(pageKey)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted">
        Redirecting...
      </div>
    );
  }

  return <SalesOperationAppShell>{children}</SalesOperationAppShell>;
}
