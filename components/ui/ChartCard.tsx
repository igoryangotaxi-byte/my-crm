import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { EmptyState } from "@/components/ui/EmptyState";

type ChartCardProps = {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  isEmpty?: boolean;
  emptyLabel?: string;
  emptyIcon?: ReactNode;
};

export function ChartCard({
  title,
  action,
  children,
  className,
  contentClassName,
  isEmpty = false,
  emptyLabel = "No data",
  emptyIcon,
}: ChartCardProps) {
  return (
    <article
      className={cn(
        "rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[0.95rem] font-bold tracking-tight text-[var(--so-text)]">{title}</h3>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className={cn("mt-4", contentClassName)}>
        {isEmpty ? (
          <EmptyState icon={emptyIcon} title={emptyLabel} compact />
        ) : (
          children
        )}
      </div>
    </article>
  );
}
