import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

type BadgeTone = "default" | "accent" | "success" | "warning" | "destructive" | "info" | "muted";

const tones: Record<BadgeTone, string> = {
  default: "bg-[var(--so-surface-2)] text-[var(--so-text)] border-[var(--so-border)]",
  accent: "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)] border-transparent",
  success: "bg-[var(--success-soft)] text-[var(--success)] border-transparent",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)] border-transparent",
  destructive: "bg-[rgba(199,15,31,0.1)] text-[var(--destructive)] border-transparent",
  info: "bg-[var(--info-soft)] text-[var(--info)] border-transparent",
  muted: "bg-[var(--so-surface-2)] text-[var(--so-muted)] border-[var(--so-border)]",
};

export function Badge({
  tone = "default",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-[6px] border px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
