"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";

type ClientPortalSection = "communications" | "financialCenter";

export function ClientPortalSectionGate({
  section,
  children,
}: {
  section: ClientPortalSection;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { loading, currentUser, tenantAccounts } = useAuth();

  const tenant = tenantAccounts.find((item) => item.id === (currentUser?.tenantId ?? ""));
  const enabled =
    section === "communications"
      ? tenant?.clientPortalCommunicationsEnabled !== false
      : tenant?.clientPortalFinancialCenterEnabled !== false;

  useEffect(() => {
    if (loading || !currentUser) return;
    if (currentUser.accountType !== "client") return;
    if (!enabled) {
      router.replace("/client/request-rides");
    }
  }, [loading, currentUser, enabled, router]);

  if (loading || !currentUser || currentUser.accountType !== "client") {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">Loading…</div>;
  }

  if (!enabled) {
    return <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted">Redirecting…</div>;
  }

  return <>{children}</>;
}
