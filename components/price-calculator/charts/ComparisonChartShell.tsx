"use client";

import type { ReactNode } from "react";

type ComparisonChartShellProps = {
  title: string;
  description: string;
  loading?: boolean;
  empty?: boolean;
  emptyMessage?: string;
  children: ReactNode;
};

export function ComparisonChartShell({
  title,
  description,
  loading = false,
  empty = false,
  emptyMessage = "No data for the selected filters.",
  children,
}: ComparisonChartShellProps) {
  return (
    <article className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)]">
      <div className="mb-3">
        <h3 className="ycds-h3 text-[var(--so-text)]">{title}</h3>
        <p className="mt-1 text-xs text-[var(--so-muted)]">{description}</p>
      </div>
      {loading ? (
        <div className="flex h-56 items-center justify-center text-sm text-[var(--so-muted)]">Loading…</div>
      ) : empty ? (
        <div className="flex h-56 items-center justify-center rounded-[12px] border border-dashed border-[var(--so-border)] bg-[var(--so-surface-2)] px-4 text-center text-sm text-[var(--so-muted)]">
          {emptyMessage}
        </div>
      ) : (
        <div className="min-h-[220px] w-full">{children}</div>
      )}
    </article>
  );
}
