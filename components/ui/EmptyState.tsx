import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "py-8" : "py-14",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[10px] border border-[var(--so-border)] bg-[var(--so-surface-2)] text-[var(--so-muted)]">
          {icon}
        </div>
      ) : null}
      <p className="ycds-h3 text-[var(--so-text)]">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-[var(--so-muted)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
