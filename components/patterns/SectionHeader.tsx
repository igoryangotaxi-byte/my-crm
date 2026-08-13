import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function SectionHeader({
  title,
  subtitle,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex flex-wrap items-start justify-between gap-2", className)}>
      <div className="min-w-0">
        <h2 className="ycds-h2 text-[var(--so-text)]">{title}</h2>
        {subtitle ? <p className="mt-0.5 text-xs text-[var(--so-muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
