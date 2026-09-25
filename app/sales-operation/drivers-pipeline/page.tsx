import { Suspense } from "react";
import { DriversPipelineBoard } from "@/components/drivers-pipeline/DriversPipelineBoard";

export default function DriversPipelinePage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-[var(--so-muted)]">Loading…</div>}>
      <DriversPipelineBoard />
    </Suspense>
  );
}
