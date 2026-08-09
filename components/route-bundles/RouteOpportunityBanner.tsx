import type { RouteBundleOpportunity } from "@/lib/route-bundles/types";

export function RouteOpportunityBanner({
  opportunity,
  busy,
  onPreview,
  onAccept,
  onDismiss,
}: {
  opportunity: RouteBundleOpportunity;
  busy: boolean;
  onPreview: () => void;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-sky-700">New opportunity</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">
        Order #{opportunity.candidateOrderId} fits this route
      </div>
      <div className="mt-0.5 text-xs text-slate-600">
        {opportunity.summary ||
          `+${(opportunity.deltaEmptyDriveM / 1000).toFixed(1)} km empty · buffer ${Math.round(opportunity.minBufferSec / 60)} min`}
      </div>
      <div className="mt-1 text-[11px] font-medium text-slate-500">
        New route: {opportunity.proposedSequence.map((id) => `#${id}`).join(" → ")}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onPreview}
          className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
        >
          Preview
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onAccept}
          className="rounded-lg bg-sky-600 px-2.5 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          Add to route
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDismiss}
          className="rounded-lg border border-sky-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
