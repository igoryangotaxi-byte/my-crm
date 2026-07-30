"use client";

import dynamic from "next/dynamic";

export const OfficeScene = dynamic(
  () => import("@/components/sales-operation/office/OfficeScene").then((m) => m.OfficeScene),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-[var(--so-muted)]">
        Loading 3D scene…
      </div>
    ),
  },
);
