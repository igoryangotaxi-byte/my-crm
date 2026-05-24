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
    <article className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-xs text-slate-600">{description}</p>
      </div>
      {loading ? (
        <div className="flex h-56 items-center justify-center text-sm text-slate-500">Loading…</div>
      ) : empty ? (
        <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 text-center text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="min-h-[220px] w-full">{children}</div>
      )}
    </article>
  );
}
