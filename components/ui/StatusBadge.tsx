import { cn } from "@/lib/ui/cn";

type StatusBadgeProps = {
  label: string;
  tone?: "green" | "yellow" | "red" | "blue" | "gray";
  compact?: boolean;
  title?: string;
  className?: string;
};

const toneMap: Record<NonNullable<StatusBadgeProps["tone"]>, string> = {
  green: "bg-[var(--success-soft)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_28%,transparent)]",
  yellow: "bg-[var(--warning-soft)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_28%,transparent)]",
  red: "bg-[rgba(199,15,31,0.1)] text-[var(--destructive)] border-[color-mix(in_srgb,var(--destructive)_28%,transparent)]",
  blue: "bg-[var(--info-soft)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_28%,transparent)]",
  gray: "bg-[var(--so-surface-2)] text-[var(--so-muted)] border-[var(--so-border)]",
};

export function StatusBadge({ label, tone = "gray", compact = false, title, className }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center rounded-[6px] border font-medium",
        toneMap[tone],
        compact
          ? "px-1.5 py-0.5 text-[0.625rem] leading-tight whitespace-normal text-center"
          : "px-2 py-0.5 text-xs",
        className,
      )}
    >
      {label}
    </span>
  );
}
