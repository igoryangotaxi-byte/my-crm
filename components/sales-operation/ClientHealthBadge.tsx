"use client";

import { useTranslations } from "next-intl";
import type { ClientHealthStatus } from "@/lib/sales-operation/client-health";

const TONES: Record<ClientHealthStatus, string> = {
  healthy: "bg-emerald-50 text-emerald-800 border-emerald-200",
  new: "bg-sky-50 text-sky-800 border-sky-200",
  watch: "bg-amber-50 text-amber-900 border-amber-200",
  at_risk: "bg-orange-50 text-orange-900 border-orange-200",
  dormant: "bg-rose-50 text-rose-800 border-rose-200",
};

const DOTS: Record<ClientHealthStatus, string> = {
  healthy: "bg-emerald-500",
  new: "bg-sky-500",
  watch: "bg-amber-500",
  at_risk: "bg-orange-500",
  dormant: "bg-rose-500",
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
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.7rem] font-semibold ${TONES[status]} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${DOTS[status]}`} />
      {t(`health.status.${status}`)}
      {typeof score === "number" ? <span className="opacity-70">· {score}</span> : null}
    </span>
  );
}
