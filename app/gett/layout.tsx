"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { GettAppShell } from "@/components/gett/GettAppShell";
import type { AppPageKey } from "@/types/auth";

function resolveGettPageKey(pathname: string): AppPageKey {
  if (pathname.startsWith("/gett/orders")) return "orders";
  if (pathname.startsWith("/gett/pre-orders")) return "preOrders";
  if (pathname.startsWith("/gett/request-rides")) return "requestRides";
  if (pathname.startsWith("/gett/bussiness-center")) return "financialCenter";
  return "requestRides";
}

export default function GettLayout({
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
    const pageKey = resolveGettPageKey(pathname);
    if (!canAccess(pageKey)) {
      router.replace("/gett/request-rides");
    }
  }, [loading, currentUser, canAccess, pathname, router]);

  if (loading || !currentUser || currentUser.status !== "approved") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Checking access...</div>;
  }

  if (currentUser.accountType === "client" || !canAccess(resolveGettPageKey(pathname))) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Redirecting...</div>;
  }

  return <GettAppShell>{children}</GettAppShell>;
}
