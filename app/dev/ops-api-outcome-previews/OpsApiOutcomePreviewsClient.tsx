"use client";

import { OpsApiOutcomeBanner } from "@/components/auth/OpsApiOutcomeBanner";

export function OpsApiOutcomePreviewsClient() {
  return (
    <div className="mx-auto max-w-lg space-y-6 p-8">
      <h1 className="text-lg font-semibold text-[var(--so-text)]">Request rides — outcome banners</h1>
      <section>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--so-text-muted)]">
          403 PERMISSION_DENIED
        </p>
        <OpsApiOutcomeBanner kind="forbidden" permission="requestRides" />
      </section>
      <section>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--so-text-muted)]">
          503 PERMISSION_STORE_UNAVAILABLE
        </p>
        <OpsApiOutcomeBanner kind="store_unavailable" onRetry={() => undefined} />
      </section>
      <section>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--so-text-muted)]">
          Timeout / 5xx unknown
        </p>
        <OpsApiOutcomeBanner kind="unknown" ordersHref="/orders" />
      </section>
    </div>
  );
}
