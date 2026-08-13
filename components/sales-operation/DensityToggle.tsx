"use client";

import type { ReactNode } from "react";
import { Rows3, StretchHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/ui/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { useSalesDensity, type UiDensity } from "@/components/sales-operation/SalesDensityContext";

export function DensityToggle() {
  const t = useTranslations("salesOperation");
  const { density, setDensity } = useSalesDensity();

  const btn = (value: UiDensity, label: string, icon: ReactNode) => (
    <Tooltip content={label} side="bottom">
      <button
        type="button"
        aria-pressed={density === value}
        aria-label={label}
        onClick={() => setDensity(value)}
        className={cn(
          "so-focus-ring inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-xs font-medium transition-colors",
          density === value
            ? "bg-[var(--so-accent-soft)] text-[var(--so-accent-strong)]"
            : "text-[var(--so-muted)] hover:bg-[var(--so-surface-hover)] hover:text-[var(--so-text)]",
        )}
      >
        {icon}
        <span className="hidden lg:inline">{label}</span>
      </button>
    </Tooltip>
  );

  return (
    <div
      className="hidden items-center rounded-[8px] border border-[var(--so-border)] bg-[var(--so-surface)] p-0.5 sm:inline-flex"
      role="group"
      aria-label={t("density.label")}
    >
      {btn("comfortable", t("density.comfortable"), <StretchHorizontal className="h-3.5 w-3.5" />)}
      {btn("compact", t("density.compact"), <Rows3 className="h-3.5 w-3.5" />)}
    </div>
  );
}
