import { SALES_KPI_METRICS, type SalesKpiMetric } from "@/lib/sales-operation/manager-kpi";
import type { KpiTargetPeriodType } from "@/lib/sales-operation/kpi-targets";

export { SALES_KPI_METRICS };
export type { SalesKpiMetric };

/** Whether a higher actual is better ("higher") or a lower actual is better ("lower"). */
export const KPI_METRIC_DIRECTION: Record<SalesKpiMetric, "higher" | "lower"> = {
  signed_count: "higher",
  conversion_pct: "higher",
  leads_worked: "higher",
  activities_logged: "higher",
  tasks_completed: "higher",
  avg_cycle_days: "lower",
  avg_response_hours: "lower",
  weighted_forecast: "higher",
  gmv: "higher",
  trips: "higher",
};

const MONEY_METRICS = new Set<SalesKpiMetric>(["weighted_forecast", "gmv"]);

export function formatKpiValue(metric: SalesKpiMetric, value: number): string {
  if (MONEY_METRICS.has(metric)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "ILS",
      maximumFractionDigits: 0,
    }).format(value);
  }
  if (metric === "conversion_pct") return `${value.toFixed(1)}%`;
  if (metric === "avg_response_hours") return `${value.toFixed(1)}h`;
  if (metric === "avg_cycle_days") return `${value.toFixed(1)}d`;
  return value.toLocaleString("en-US");
}

/**
 * Attainment as a percentage of target (100 = on target). Returns null when no
 * target is set. Lower-is-better metrics invert the ratio.
 */
export function computeAttainment(
  metric: SalesKpiMetric,
  actual: number,
  target: number,
): number | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  const direction = KPI_METRIC_DIRECTION[metric];
  if (direction === "lower") {
    if (actual <= 0) return 100;
    return Math.round((target / actual) * 100);
  }
  return Math.round((actual / target) * 100);
}

export function attainmentTone(attainment: number | null): "green" | "yellow" | "red" | "gray" {
  if (attainment === null) return "gray";
  if (attainment >= 100) return "green";
  if (attainment >= 70) return "yellow";
  return "red";
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function lastDayOfMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

export type KpiPeriodRange = { from: string; to: string; periodStart: string };

/**
 * Resolves a KPI period into an actuals date range (from/to) and the canonical
 * target period_start. `anchorMonth` is "YYYY-MM" (any month within the period).
 */
export function resolveKpiPeriod(
  periodType: KpiTargetPeriodType,
  anchorMonth: string,
): KpiPeriodRange {
  const match = anchorMonth.match(/^(\d{4})-(\d{2})$/);
  const now = new Date();
  const year = match ? Number(match[1]) : now.getFullYear();
  const month = match ? Number(match[2]) - 1 : now.getMonth();

  if (periodType === "quarter") {
    const startMonth = Math.floor(month / 3) * 3;
    const endMonth = startMonth + 2;
    const from = `${year}-${pad(startMonth + 1)}-01`;
    const to = `${year}-${pad(endMonth + 1)}-${pad(lastDayOfMonth(year, endMonth))}`;
    return { from, to, periodStart: from };
  }

  const from = `${year}-${pad(month + 1)}-01`;
  const to = `${year}-${pad(month + 1)}-${pad(lastDayOfMonth(year, month))}`;
  return { from, to, periodStart: from };
}

/** Default anchor month ("YYYY-MM") for the current date. */
export function currentAnchorMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}
