import { Fragment } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/ui/cn";

export type Crumb = {
  label: ReactNode;
  href?: string;
};

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-xs font-medium">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <Fragment key={index}>
              <li className="inline-flex min-w-0 items-center">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="so-focus-ring truncate rounded text-[var(--so-muted)] transition-colors hover:text-[var(--so-text)]"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className={cn(
                      "truncate",
                      isLast ? "font-semibold text-[var(--so-text)]" : "text-[var(--so-muted)]",
                    )}
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast ? (
                <li aria-hidden className="text-[var(--so-muted-2)]">
                  <ChevronRight className="h-3.5 w-3.5" />
                </li>
              ) : null}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
