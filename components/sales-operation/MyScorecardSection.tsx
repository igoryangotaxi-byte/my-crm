"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/auth/AuthProvider";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type { ManagerKpiRow } from "@/lib/sales-operation/manager-kpi";
import type { SalesKpiTarget, KpiTargetPeriodType } from "@/lib/sales-operation/kpi-targets";
import {
  SALES_KPI_METRICS,
  attainmentTone,
  computeAttainment,
  currentAnchorMonth,
  formatKpiValue,
  resolveKpiPeriod,
} from "@/lib/sales-operation/kpi-view";

export function MyScorecardSection() {
  const t = useTranslations("salesOperation");
  const { currentUser } = useAuth();
  const [periodType, setPeriodType] = useState<KpiTargetPeriodType>("month");
  const [anchorMonth, setAnchorMonth] = useState(() => currentAnchorMonth());
  const [row, setRow] = useState<ManagerKpiRow | null>(null);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const period = useMemo(() => resolveKpiPeriod(periodType, anchorMonth), [periodType, anchorMonth]);
  const userId = currentUser?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const kpiParams = new URLSearchParams({
        from: period.from,
        to: period.to,
        managerUserId: userId,
      });
      const targetParams = new URLSearchParams({
        periodType,
        periodStart: period.periodStart,
        managerUserId: userId,
      });
      const [kpiRes, targetRes] = await Promise.all([
        fetch(`/api/sales-operation/analytics/kpi?${kpiParams.toString()}`, { cache: "no-store" }),
        fetch(`/api/sales-operation/kpi-targets?${targetParams.toString()}`, { cache: "no-store" }),
      ]);
      const kpiData = (await kpiRes.json()) as {
        ok?: boolean;
        report?: { rows: ManagerKpiRow[] };
        error?: string;
      };
      const targetData = (await targetRes.json()) as {
        ok?: boolean;
        targets?: SalesKpiTarget[];
        error?: string;
      };
      if (!kpiRes.ok || !kpiData.ok) throw new Error(kpiData.error ?? t("performance.loadError"));
      if (!targetRes.ok || !targetData.ok) throw new Error(targetData.error ?? t("performance.loadError"));

      const found = (kpiData.report?.rows ?? []).find((r) => r.managerUserId === userId) ?? null;
      setRow(found);
      const map: Record<string, number> = {};
      for (const target of targetData.targets ?? []) {
        if (target.managerUserId === userId) map[target.metricKey] = target.targetValue;
      }
      setTargets(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("performance.loadError"));
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [period, periodType, t, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const barColor = (attainment: number) => {
    if (attainment >= 100) return "bg-emerald-500";
    if (attainment >= 70) return "bg-amber-500";
    return "bg-rose-500";
  };

  return (
    <section className="crm-page pb-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="crm-section-title">{t("performance.myScorecardTitle")}</h2>
          <p className="text-xs text-[var(--so-muted)]">{t("performance.myScorecardSubtitle")}</p>
        </div>
        <div className="flex items-end gap-2">
          <select
            value={periodType}
            onChange={(event) => setPeriodType(event.target.value as KpiTargetPeriodType)}
            className="crm-input h-9 w-32 px-2.5 text-sm"
          >
            <option value="month">{t("performance.month")}</option>
            <option value="quarter">{t("performance.quarter")}</option>
          </select>
          <input
            type="month"
            value={anchorMonth}
            onChange={(event) => setAnchorMonth(event.target.value || currentAnchorMonth())}
            className="crm-input h-9 w-40 px-2.5 text-sm"
          />
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {SALES_KPI_METRICS.map((metric) => {
          const actual = row?.actuals[metric] ?? 0;
          const target = targets[metric];
          const attainment = target !== undefined ? computeAttainment(metric, actual, target) : null;
          return (
            <article
              key={metric}
              className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-xs)] transition-shadow hover:shadow-[var(--so-shadow-sm)]"
            >
              <p className="text-xs text-[var(--so-muted)]">{t(`kpiMetric.${metric}`)}</p>
              <p className="mt-1 text-xl font-bold tracking-tight text-[var(--so-text)]">
                {loading ? <span className="inline-block h-6 w-16 animate-pulse rounded bg-[var(--so-border)]" /> : formatKpiValue(metric, actual)}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-xs text-[var(--so-muted)]">
                  {target !== undefined
                    ? `${t("performance.target")}: ${formatKpiValue(metric, target)}`
                    : t("performance.noTargets")}
                </span>
                {attainment !== null ? (
                  <StatusBadge label={`${attainment}%`} tone={attainmentTone(attainment)} compact />
                ) : null}
              </div>
              {attainment !== null ? (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--so-border)]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-500 ${barColor(attainment)}`}
                    style={{ width: `${Math.min(100, Math.max(0, attainment))}%` }}
                  />
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}
