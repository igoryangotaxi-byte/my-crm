import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";

type CardProps = HTMLAttributes<HTMLDivElement> & {
  hover?: boolean;
  padded?: boolean;
};

export function Card({ hover = false, padded = false, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn("so-card", hover && "so-card-hover", padded && "p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-3", className)}>
      <div className="min-w-0">
        <h3 className="text-[0.95rem] font-bold tracking-tight text-[var(--so-text)]">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-sm text-[var(--so-muted)]">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
