import type { BundleHealth } from "@/lib/route-bundles/types";
import { cn } from "@/lib/ui/cn";

const STYLES: Record<BundleHealth, string> = {
  safe: "bg-emerald-50 text-emerald-700 border-emerald-200",
  tight: "bg-amber-50 text-amber-800 border-amber-200",
  at_risk: "bg-orange-50 text-orange-800 border-orange-200",
  conflict: "bg-rose-50 text-rose-800 border-rose-200",
};

const LABELS: Record<BundleHealth, string> = {
  safe: "Safe",
  tight: "Tight",
  at_risk: "At risk",
  conflict: "Conflict",
};

export function BundleHealthBadge({ health }: { health: BundleHealth }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
        STYLES[health] ?? STYLES.safe,
      )}
    >
      {LABELS[health] ?? health}
    </span>
  );
}
