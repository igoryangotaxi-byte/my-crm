import { Suspense } from "react";
import { TrackerBoardView } from "@/components/sales-operation/tracker/TrackerBoardView";

export default async function TrackerBoardPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <Suspense fallback={<div className="p-6 text-sm text-[var(--so-muted)]">Loading…</div>}>
      <TrackerBoardView projectId={projectId} />
    </Suspense>
  );
}
