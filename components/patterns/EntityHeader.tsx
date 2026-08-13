import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

export function EntityHeader({
  title,
  subtitle,
  meta,
  actions,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h1 className="ycds-h1 truncate text-[var(--so-text)]">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-[var(--so-muted)]">{subtitle}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
