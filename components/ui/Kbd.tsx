import type { HTMLAttributes } from "react";
import { cn } from "@/lib/ui/cn";

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        "pointer-events-none inline-flex h-5 min-w-5 items-center justify-center rounded-[4px] border border-[var(--so-border)] bg-[var(--so-surface-2)] px-1 font-mono text-[0.65rem] font-medium text-[var(--so-muted)]",
        className,
      )}
      {...props}
    />
  );
}
