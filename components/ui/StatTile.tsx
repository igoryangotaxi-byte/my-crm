import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Sparkline } from "@/components/ui/Sparkline";

export type StatTileDelta = {
  /** Signed percentage change; sign drives color + arrow. */
  value: number;
  /** Optional caption shown next to the chip, e.g. "vs prev period". */
  label?: string;
  /** When true, a negative value is treated as good (e.g. cost down). */
  invert?: boolean;
};

type StatTileProps = {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: "default" | "success" | "danger" | "accent";
  loading?: boolean;
  delta?: StatTileDelta;
  spark?: number[];
  sparkTone?: string;
  className?: string;
};

const valueTone: Record<NonNullable<StatTileProps["tone"]>, string> = {
  default: "text-[var(--so-text)]",
  success: "text-[var(--success)]",
  danger: "text-[var(--destructive)]",
  accent: "text-[var(--so-accent-strong)]",
};

function DeltaChip({ delta }: { delta: StatTileDelta }) {
  const rounded = Math.round(delta.value * 10) / 10;
  const positive = rounded > 0;
  const negative = rounded < 0;
  const good = delta.invert ? negative : positive;
  const bad = delta.invert ? positive : negative;
  const neutral = rounded === 0;
  const Arrow = rounded >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6875rem] font-bold tabular-nums",
          good && "bg-[var(--success-soft)] text-[var(--success)]",
          bad && "bg-[rgba(199,15,31,0.1)] text-[var(--destructive)]",
          neutral && "bg-[var(--so-surface-2)] text-[var(--so-muted)]",
        )}
      >
        {!neutral ? <Arrow className="h-3 w-3" strokeWidth={2.5} /> : null}
        {Math.abs(rounded)}%
      </span>
      {delta.label ? (
        <span className="text-[0.6875rem] text-[var(--so-muted-2)]">{delta.label}</span>
      ) : null}
    </span>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  tone = "default",
  loading = false,
  delta,
  spark,
  sparkTone,
  className,
}: StatTileProps) {
  const hasSpark = Array.isArray(spark) && spark.length >= 2;
  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)] transition-shadow hover:shadow-[var(--so-shadow-sm)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="ycds-label text-[var(--so-muted)]">{label}</p>
        {icon ? (
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] bg-[var(--so-surface-2)] text-[var(--so-muted)]">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <div className="h-8 w-24 animate-pulse rounded bg-[var(--so-border)]" />
          ) : (
            <p className={cn("ycds-kpi text-[1.6rem]", valueTone[tone])}>{value}</p>
          )}
          {delta && !loading ? (
            <div className="mt-1.5">
              <DeltaChip delta={delta} />
            </div>
          ) : null}
        </div>
        {hasSpark && !loading ? (
          <Sparkline data={spark!} stroke={sparkTone ?? "var(--so-accent)"} className="shrink-0" />
        ) : null}
      </div>

      {hint ? <p className="mt-2 text-xs text-[var(--so-muted)]">{hint}</p> : null}
    </article>
  );
}
