import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { SectionHeader } from "@/components/patterns/SectionHeader";

export function FormSection({
  title,
  subtitle,
  children,
  className,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-3", className)}>
      {title ? <SectionHeader title={title} subtitle={subtitle} /> : null}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
