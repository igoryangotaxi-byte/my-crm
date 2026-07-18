import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { Breadcrumbs, type Crumb } from "@/components/ui/Breadcrumbs";

type PageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Extra content under the subtitle (e.g. badges, status pills). */
  meta?: ReactNode;
  /** Right-aligned actions (buttons, filters). */
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  meta,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <Breadcrumbs items={breadcrumbs} className="mb-2" />
        ) : null}
        {typeof title === "string" ? (
          <h1 className="truncate text-2xl font-bold tracking-tight text-[var(--so-text)]">{title}</h1>
        ) : (
          title
        )}
        {subtitle ? (
          <p className="mt-0.5 text-sm text-[var(--so-muted)]">{subtitle}</p>
        ) : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-1.5">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
