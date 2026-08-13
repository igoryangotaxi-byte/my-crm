"use client";

import { useTranslations } from "next-intl";
import type { ClientHealthStatus } from "@/lib/sales-operation/client-health";

const TONES: Record<ClientHealthStatus, string> = {
  healthy: "bg-[var(--success-soft)] text-[var(--success)] border-[color-mix(in_srgb,var(--success)_28%,transparent)]",
  new: "bg-[var(--info-soft)] text-[var(--info)] border-[color-mix(in_srgb,var(--info)_28%,transparent)]",
  watch: "bg-[var(--warning-soft)] text-[var(--warning)] border-[color-mix(in_srgb,var(--warning)_28%,transparent)]",
  at_risk: "bg-[rgba(249,115,22,0.12)] text-[#c2410c] border-[rgba(249,115,22,0.28)]",
  dormant: "bg-[rgba(199,15,31,0.1)] text-[var(--destructive)] border-[color-mix(in_srgb,var(--destructive)_28%,transparent)]",
};

const DOTS: Record<ClientHealthStatus, string> = {
  healthy: "bg-[var(--success)]",
  new: "bg-[var(--info)]",
  watch: "bg-[var(--warning)]",
  at_risk: "bg-[#f97316]",
  dormant: "bg-[var(--destructive)]",
};

export function ClientHealthBadge({
  status,
  score,
  className = "",
}: {
  status: ClientHealthStatus;
  score?: number;
  className?: string;
}) {
  const t = useTranslations("salesOperation");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[6px] border px-2 py-0.5 text-[0.7rem] font-medium ${TONES[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} />
      {t(`health.status.${status}`)}
      {typeof score === "number" ? <span className="opacity-70">· {score}</span> : null}
    </span>
  );
}
