"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/ui/cn";

export type TabItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
};

type TabsProps<T extends string> = {
  value: T;
  onValueChange: (value: T) => void;
  items: TabItem<T>[];
  className?: string;
  size?: "sm" | "md";
};

export function Tabs<T extends string>({
  value,
  onValueChange,
  items,
  className,
  size = "md",
}: TabsProps<T>) {
  const layoutId = useId();

  const handleKey = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const dir = event.key === "ArrowRight" ? 1 : -1;
    const next = (index + dir + items.length) % items.length;
    onValueChange(items[next]!.value);
  };

  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-1 rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface-2)] p-1",
        className,
      )}
    >
      {items.map((item, index) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onKeyDown={(e) => handleKey(e, index)}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative inline-flex items-center gap-1.5 rounded-[9px] font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:shadow-[0_0_0_3px_rgba(255,45,45,0.18)]",
              size === "sm" ? "px-2.5 py-1 text-[0.8125rem]" : "px-3.5 py-1.5 text-sm",
              active ? "text-[var(--so-text)]" : "text-[var(--so-muted)] hover:text-[var(--so-text)]",
            )}
          >
            {active ? (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                className="absolute inset-0 rounded-[9px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-xs)]"
              />
            ) : null}
            {item.icon ? <span className="relative z-[1] flex">{item.icon}</span> : null}
            <span className="relative z-[1]">{item.label}</span>
            {item.badge != null ? (
              <span className="relative z-[1] inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-[var(--so-accent-soft)] px-1.5 text-[0.6875rem] font-bold text-[var(--so-accent-strong)]">
                {item.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
