import type { RouteBundleItem, TimelineEntry } from "@/lib/route-bundles/types";

function fmt(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

export function BundleTimeline({
  timeline,
  items,
}: {
  timeline: TimelineEntry[];
  items: RouteBundleItem[];
}) {
  const entries =
    timeline.length > 0
      ? timeline
      : items.flatMap((item) => {
          const out: TimelineEntry[] = [
            {
              kind: "pickup",
              at: item.scheduledAt,
              orderId: item.orderId,
              label: `Pickup #${item.orderId}`,
            },
          ];
          if (item.expectedDropoff) {
            out.push({
              kind: "dropoff",
              at: item.expectedDropoff,
              orderId: item.orderId,
              label: `Dropoff #${item.orderId}`,
            });
          }
          return out;
        });

  if (!entries.length) {
    return <div className="text-xs text-[var(--so-muted)]">No timeline yet.</div>;
  }

  return (
    <div className="space-y-2">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--so-muted)]">Timeline</div>
      <ol className="space-y-2 border-l border-[var(--so-border)] pl-3">
        {entries.map((entry, idx) => {
          if (entry.kind === "transfer") {
            return (
              <li key={`${entry.orderFromId}-${entry.orderToId}-${idx}`} className="text-xs text-[var(--so-muted)]">
                <span className="font-semibold text-[var(--so-text)]">
                  {fmt(entry.from)}–{fmt(entry.to)}
                </span>
                <div>
                  Drive {Math.round(entry.driveSec / 60)} min · Buffer {Math.round(entry.bufferSec / 60)} min
                </div>
              </li>
            );
          }
          return (
            <li key={`${entry.kind}-${entry.orderId}-${idx}`} className="text-xs">
              <span className="font-semibold text-[var(--so-text)]">{fmt(entry.at)}</span>
              <div className="text-[var(--so-muted)]">{entry.label}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
