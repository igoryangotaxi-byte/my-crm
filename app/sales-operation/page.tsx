"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/auth/AuthProvider";
import { resolveAuthenticatedLandingPath } from "@/lib/login-redirect";

/** /sales-operation index — send users to their first allowed page, never hardcode pipeline. */
export default function SalesOperationIndexPage() {
  const router = useRouter();
  const { loading, currentUser, canAccess } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!currentUser || currentUser.status !== "approved") {
      router.replace("/login");
      return;
    }
    router.replace(
      resolveAuthenticatedLandingPath({
        accountType: currentUser.accountType,
        canAccess,
      }),
    );
  }, [loading, currentUser, canAccess, router]);

  return (
    <div className="flex min-h-screen items-center justify-center text-sm text-muted">
      Redirecting...
    </div>
  );
}
