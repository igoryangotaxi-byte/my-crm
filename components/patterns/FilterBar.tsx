"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/ui/cn";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function FilterChip({
  active,
  onClick,
  children,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "so-focus-ring inline-flex h-8 items-center rounded-[8px] border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-[var(--primary)] bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
          : "border-[var(--so-border-strong)] bg-[var(--so-surface)] text-[var(--so-text)] hover:bg-[var(--so-surface-hover)]",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function FilterBar({
  children,
  advanced,
  activeCount = 0,
  onReset,
  resetLabel = "Reset",
  className,
}: {
  children: ReactNode;
  advanced?: ReactNode;
  activeCount?: number;
  onReset?: () => void;
  resetLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
      {advanced}
      {activeCount > 0 ? (
        <Badge tone="accent" className="tabular-nums">
          {activeCount}
        </Badge>
      ) : null}
      {onReset && activeCount > 0 ? (
        <Button variant="ghost" size="sm" onClick={onReset} leftIcon={<X className="h-3.5 w-3.5" />}>
          {resetLabel}
        </Button>
      ) : null}
    </div>
  );
}
