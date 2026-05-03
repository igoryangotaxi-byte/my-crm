"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { AppShell } from "@/components/layout/AppShell";

export default function ClientPortalLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { loading, currentUser } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!currentUser || currentUser.status !== "approved") {
      router.replace("/login");
      return;
    }
    if (currentUser.accountType !== "client") {
      router.replace("/request-rides");
      return;
    }
    if (pathname === "/client") {
      router.replace("/client/request-rides");
    }
  }, [loading, currentUser, pathname, router]);

  if (loading || !currentUser || currentUser.status !== "approved") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Checking access...</div>;
  }
  if (currentUser.accountType !== "client") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted">Redirecting...</div>;
  }
  return <AppShell>{children}</AppShell>;
}
