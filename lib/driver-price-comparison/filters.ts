import type { ComparisonFilters } from "@/lib/driver-price-comparison/types";
import {
  DAY_OF_WEEK_LABELS,
  type DayOfWeekLabel,
} from "@/lib/driver-price-comparison/calculated-fields";

export function normalizeComparisonFilters(input: Partial<ComparisonFilters>): ComparisonFilters {
  return {
    since: typeof input.since === "string" && input.since.trim() ? input.since.trim() : null,
    till: typeof input.till === "string" && input.till.trim() ? input.till.trim() : null,
    dayOfWeek: Array.isArray(input.dayOfWeek)
      ? input.dayOfWeek.filter((d): d is DayOfWeekLabel =>
          DAY_OF_WEEK_LABELS.includes(d as DayOfWeekLabel),
        )
      : [],
    hour: Array.isArray(input.hour)
      ? input.hour.filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
      : [],
    distanceBucket: Array.isArray(input.distanceBucket) ? input.distanceBucket : [],
    differenceFlag: Array.isArray(input.differenceFlag) ? input.differenceFlag : [],
    corpClientId:
      typeof input.corpClientId === "string" && input.corpClientId.trim()
        ? input.corpClientId.trim()
        : null,
  };
}

export function buildComparisonFilterQuery(filters: ComparisonFilters) {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.since) {
    params.push(filters.since);
    clauses.push(`order_date >= $${params.length}`);
  }
  if (filters.till) {
    params.push(filters.till);
    clauses.push(`order_date <= $${params.length}`);
  }
  if (filters.dayOfWeek?.length) {
    params.push(filters.dayOfWeek.map((d) => d.trim()));
    clauses.push(`trim(day_of_week) = any($${params.length}::text[])`);
  }
  if (filters.hour?.length) {
    params.push(filters.hour);
    clauses.push(`hour = any($${params.length}::int[])`);
  }
  if (filters.distanceBucket?.length) {
    params.push(filters.distanceBucket);
    clauses.push(`distance_bucket = any($${params.length}::text[])`);
  }
  if (filters.differenceFlag?.length) {
    params.push(filters.differenceFlag);
    clauses.push(`difference_flag = any($${params.length}::text[])`);
  }
  if (filters.corpClientId) {
    params.push(filters.corpClientId);
    clauses.push(`corp_client_id = $${params.length}`);
  }

  const whereSql = clauses.length ? `where ${clauses.join(" and ")}` : "";
  return { whereSql, params };
}

export function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index] ?? 0;
}
