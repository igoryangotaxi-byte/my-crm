"use client";

import { Suspense } from "react";
import { YangoCorpRegisterView } from "@/components/sales-operation/YangoCorpRegisterView";

export default function SalesOperationCorpRegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-[40vh] items-center justify-center text-sm text-[var(--so-muted)]">
          Loading registration form…
        </div>
      }
    >
      <YangoCorpRegisterView />
    </Suspense>
  );
}
