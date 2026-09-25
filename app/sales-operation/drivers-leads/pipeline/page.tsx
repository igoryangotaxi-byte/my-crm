import { Suspense } from "react";
import { DriversPipelineBoard } from "@/components/drivers-pipeline/DriversPipelineBoard";

export default function DriversLeadsPipelinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center p-4 text-sm text-[var(--so-muted)]">
          Loading…
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <DriversPipelineBoard />
      </div>
    </Suspense>
  );
}
