import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { Label } from "@/components/ui/Label";

export function Field({
  label,
  htmlFor,
  required,
  hint,
  error,
  children,
  className,
}: {
  label?: ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label ? (
        <Label htmlFor={htmlFor}>
          {label}
          {required ? <span className="ml-0.5 text-[var(--destructive)]">*</span> : null}
        </Label>
      ) : null}
      {children}
      {error ? <p className="text-xs text-[var(--destructive)]">{error}</p> : null}
      {!error && hint ? <p className="text-xs text-[var(--so-muted)]">{hint}</p> : null}
    </div>
  );
}
