import { Suspense } from "react";
import { OfficeShell } from "@/components/sales-operation/office/OfficeShell";

export default function SalesOperationOfficePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--so-muted)]">
          Loading 3D Office…
        </div>
      }
    >
      <OfficeShell />
    </Suspense>
  );
}
