"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { rowsToCsv } from "@/lib/sales-operation/analytics";
import type { ManagerKpiRow } from "@/lib/sales-operation/manager-kpi";
import type { SalesKpiTarget, KpiTargetPeriodType } from "@/lib/sales-operation/kpi-targets";
import {
  SALES_KPI_METRICS,
  attainmentTone,
  computeAttainment,
  currentAnchorMonth,
  formatKpiValue,
  resolveKpiPeriod,
  type SalesKpiMetric,
} from "@/lib/sales-operation/kpi-view";

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const blob = new Blob([`\ufeff${rowsToCsv(rows)}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function targetKey(managerUserId: string, metric: SalesKpiMetric): string {
  return `${managerUserId}::${metric}`;
}

export function TeamPerformanceView() {
  const t = useTranslations("salesOperation");
  const [periodType, setPeriodType] = useState<KpiTargetPeriodType>("month");
  const [anchorMonth, setAnchorMonth] = useState(() => currentAnchorMonth());
  const [rows, setRows] = useState<ManagerKpiRow[]>([]);
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [draftTargets, setDraftTargets] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const period = useMemo(() => resolveKpiPeriod(periodType, anchorMonth), [periodType, anchorMonth]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const kpiParams = new URLSearchParams({ from: period.from, to: period.to });
      const targetParams = new URLSearchParams({
        periodType,
        periodStart: period.periodStart,
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
      if (!kpiRes.ok || !kpiData.ok) throw new Error(kpiData.error ?? "Failed to load KPI report.");
      if (!targetRes.ok || !targetData.ok) throw new Error(targetData.error ?? "Failed to load targets.");

      setRows(kpiData.report?.rows ?? []);
      const map: Record<string, number> = {};
      const draft: Record<string, string> = {};
      for (const target of targetData.targets ?? []) {
        const key = targetKey(target.managerUserId, target.metricKey);
        map[key] = target.targetValue;
        draft[key] = String(target.targetValue);
      }
      setTargets(map);
      setDraftTargets(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("performance.loadError"));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [period, periodType, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveTarget = useCallback(
    async (managerUserId: string, metric: SalesKpiMetric, rawValue: string) => {
      const key = targetKey(managerUserId, metric);
      const trimmed = rawValue.trim();
      if (trimmed === "" || Number(trimmed) === (targets[key] ?? undefined)) return;
      const value = Number(trimmed);
      if (!Number.isFinite(value)) return;
      try {
        const res = await fetch(`/api/sales-operation/kpi-targets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            managerUserId,
            metricKey: metric,
            periodType,
            periodStart: period.periodStart,
            targetValue: value,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok || !data.ok) throw new Error(data.error ?? t("performance.targetSaveFailed"));
        setTargets((prev) => ({ ...prev, [key]: value }));
        setNotice(t("performance.targetSaved"));
        window.setTimeout(() => setNotice(null), 2000);
      } catch (err) {
        setError(err instanceof Error ? err.message : t("performance.targetSaveFailed"));
      }
    },
    [period.periodStart, periodType, t, targets],
  );

  const exportCsv = useCallback(() => {
    const header = [
      t("performance.manager"),
      ...SALES_KPI_METRICS.flatMap((metric) => [
        `${t(`kpiMetric.${metric}`)} (${t("performance.actual")})`,
        `${t(`kpiMetric.${metric}`)} (${t("performance.target")})`,
        `${t(`kpiMetric.${metric}`)} (${t("performance.attainment")})`,
      ]),
    ];
    const body = rows.map((row) => [
      row.managerName,
      ...SALES_KPI_METRICS.flatMap((metric) => {
        const actual = row.actuals[metric];
        const target = targets[targetKey(row.managerUserId, metric)];
        const attainment = target !== undefined ? computeAttainment(metric, actual, target) : null;
        return [actual, target ?? "", attainment === null ? "" : `${attainment}%`];
      }),
    ]);
    downloadCsv(`team-performance-${period.periodStart}.csv`, [header, ...body]);
  }, [period.periodStart, rows, t, targets]);

  return (
    <section className="crm-page">
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]">
        <label className="text-xs text-[var(--so-muted)]">
          {t("performance.periodType")}
          <select
            value={periodType}
            onChange={(event) => setPeriodType(event.target.value as KpiTargetPeriodType)}
            className="crm-input mt-1 block h-9 w-40 px-2.5 text-sm"
          >
            <option value="month">{t("performance.month")}</option>
            <option value="quarter">{t("performance.quarter")}</option>
          </select>
        </label>
        <label className="text-xs text-[var(--so-muted)]">
          {t("performance.month")}
          <input
            type="month"
            value={anchorMonth}
            onChange={(event) => setAnchorMonth(event.target.value || currentAnchorMonth())}
            className="crm-input mt-1 block h-9 w-44 px-2.5 text-sm"
          />
        </label>
        <div className="ml-auto flex items-end gap-2">
          {notice ? <span className="pb-2 text-xs font-medium text-emerald-600">{notice}</span> : null}
          <Button loading={loading} disabled={loading} onClick={() => void load()}>
            {t("manager.refresh")}
          </Button>
          <Button
            variant="secondary"
            leftIcon={<Download className="h-4 w-4" />}
            onClick={exportCsv}
            disabled={rows.length === 0}
          >
            {t("report.exportCsv")}
          </Button>
        </div>
      </div>

      <p className="mb-3 text-xs text-[var(--so-muted)]">{t("performance.editTargetHint")}</p>
      {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

      {rows.length === 0 ? (
        loading ? (
          <p className="text-sm text-[var(--so-muted)]">{t("loading")}</p>
        ) : (
          <div className="so-card">
            <EmptyState title={t("performance.noManagers")} />
          </div>
        )
      ) : (
        <div className="overflow-x-auto rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] shadow-[var(--so-shadow-sm)]">
          <table className="min-w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--so-border)] bg-[var(--so-surface-2)] text-left">
                <th className="sticky left-0 z-10 bg-[var(--so-surface-2)] px-3 py-2.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--so-muted)]">
                  {t("performance.manager")}
                </th>
                {SALES_KPI_METRICS.map((metric) => (
                  <th
                    key={metric}
                    className="whitespace-nowrap px-3 py-2.5 text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--so-muted)]"
                  >
                    {t(`kpiMetric.${metric}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.managerUserId}
                  className="border-b border-[var(--so-border)] align-top transition-colors last:border-0 hover:bg-[var(--so-surface-hover)]"
                >
                  <td className="sticky left-0 z-10 bg-[var(--so-surface)] px-3 py-2 font-semibold text-[var(--so-text)] whitespace-nowrap">
                    {row.managerName}
                  </td>
                  {SALES_KPI_METRICS.map((metric) => {
                    const key = targetKey(row.managerUserId, metric);
                    const actual = row.actuals[metric];
                    const target = targets[key];
                    const attainment =
                      target !== undefined ? computeAttainment(metric, actual, target) : null;
                    return (
                      <td key={metric} className="px-3 py-2 whitespace-nowrap">
                        <div className="font-semibold text-[var(--so-text)]">
                          {formatKpiValue(metric, actual)}
                        </div>
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="number"
                            value={draftTargets[key] ?? ""}
                            placeholder={t("performance.target")}
                            onChange={(event) =>
                              setDraftTargets((prev) => ({ ...prev, [key]: event.target.value }))
                            }
                            onBlur={(event) =>
                              void saveTarget(row.managerUserId, metric, event.target.value)
                            }
                            className="crm-input h-7 w-20 px-1.5 text-xs"
                          />
                          {attainment !== null ? (
                            <StatusBadge
                              label={`${attainment}%`}
                              tone={attainmentTone(attainment)}
                              compact
                            />
                          ) : null}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
