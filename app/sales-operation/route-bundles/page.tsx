"use client";

import { Suspense } from "react";
import { RouteBundlesView } from "@/components/route-bundles/RouteBundlesView";

export default function SalesOperationRouteBundlesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[50vh] items-center justify-center text-sm text-[var(--so-muted)]">
          Loading Route Bundles…
        </div>
      }
    >
      <RouteBundlesView />
    </Suspense>
  );
}
