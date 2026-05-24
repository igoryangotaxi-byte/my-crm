import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  DAY_OF_WEEK_LABELS,
  isComparableRide,
  mapDbEnrichedRow,
  type ComparisonEnrichedRow,
  type DayOfWeekLabel,
  type DifferenceFlag,
} from "@/lib/driver-price-comparison/calculated-fields";
import {
  normalizeComparisonFilters,
  percentile,
} from "@/lib/driver-price-comparison/filters";
import type {
  ComparisonFilters,
  ComparisonKpis,
  ComparisonSummaryResponse,
  ComparisonTableRow,
  DistanceBucketPoint,
  FrequencyByDayPoint,
  HeatmapCell,
  RankedBucket,
  ScatterPoint,
  SeverityByDayPoint,
  TrendPoint,
} from "@/lib/driver-price-comparison/types";

const PAGE_SIZE = 1000;
const SUMMARY_MAX_ROWS = 50000;
const SCATTER_SAMPLE_SIZE = 2000;
const EXPORT_MAX_ROWS = 50000;

type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

function applySupabaseFilters(
  query: ReturnType<ReturnType<SupabaseAdmin["from"]>["select"]>,
  filters: ComparisonFilters,
) {
  let next = query;
  if (filters.since) {
    next = next.gte("order_date", filters.since);
  }
  if (filters.till) {
    next = next.lte("order_date", filters.till);
  }
  if (filters.dayOfWeek?.length) {
    next = next.in(
      "day_of_week",
      filters.dayOfWeek.map((day) => day.trim()),
    );
  }
  if (filters.hour?.length) {
    next = next.in("hour", filters.hour);
  }
  if (filters.distanceBucket?.length) {
    next = next.in("distance_bucket", filters.distanceBucket);
  }
  if (filters.differenceFlag?.length) {
    next = next.in("difference_flag", filters.differenceFlag);
  }
  if (filters.corpClientId) {
    next = next.eq("corp_client_id", filters.corpClientId);
  }
  return next;
}

export async function fetchEnrichedRows(
  rawFilters: Partial<ComparisonFilters>,
  limit = SUMMARY_MAX_ROWS,
): Promise<ComparisonEnrichedRow[]> {
  const filters = normalizeComparisonFilters(rawFilters);
  const supabase = getSupabaseAdminClient();
  const rows: ComparisonEnrichedRow[] = [];
  let from = 0;

  while (rows.length < limit) {
    const remaining = limit - rows.length;
    const batchSize = Math.min(PAGE_SIZE, remaining);
    let query = applySupabaseFilters(
      supabase.from("driver_price_comparison_enriched").select("*"),
      filters,
    )
      .order("absolute_difference_nis", { ascending: false })
      .range(from, from + batchSize - 1);

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    if (!data?.length) break;

    for (const row of data) {
      const mapped = mapDbEnrichedRow(row as Record<string, unknown>);
      if (mapped) rows.push(mapped);
    }
    if (data.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

export async function getCoverageStats() {
  const supabase = getSupabaseAdminClient();
  const [{ count: totalGpOrders }, { count: ridesWithMone }] = await Promise.all([
    supabase.from("gp_fct_order_raw").select("*", { count: "exact", head: true }),
    supabase.from("driver_price_comparison_enriched").select("*", { count: "exact", head: true }),
  ]);

  const total = totalGpOrders ?? 0;
  const withMone = ridesWithMone ?? 0;
  return {
    totalTaxiOrders: total,
    ridesWithMone: withMone,
    moneCoveragePct: total > 0 ? (withMone / total) * 100 : 0,
  };
}

export async function getLastTaxiOrdersSync() {
  const supabase = getSupabaseAdminClient();
  const sourceNames = ["fct_order_b2b_created_window", "taxi_orders_created_window"];
  for (const sourceName of sourceNames) {
    const { data } = await supabase
      .from("sync_state")
      .select("last_success_at")
      .eq("source_name", sourceName)
      .maybeSingle();
    if (data?.last_success_at) {
      return data.last_success_at;
    }
  }
  return null;
}

function comparableRows(rows: ComparisonEnrichedRow[]) {
  return rows.filter(isComparableRide);
}

function buildKpis(rows: ComparisonEnrichedRow[], coverage: Awaited<ReturnType<typeof getCoverageStats>>): ComparisonKpis {
  const analyticsRows = comparableRows(rows);
  const totalRides = analyticsRows.length;
  const ridesWithDifference = analyticsRows.filter(
    (row) => row.difference_flag !== "No difference",
  ).length;
  const absDiffs = analyticsRows.map((row) => row.absolute_difference_nis);
  const pctDiffs = rows
    .map((row) => row.difference_percent)
    .filter((value): value is number => value !== null);

  return {
    totalRides,
    ridesWithDifference,
    ridesWithDifferencePct: totalRides > 0 ? (ridesWithDifference / totalRides) * 100 : 0,
    averageAbsoluteDifferenceNis:
      absDiffs.length > 0 ? absDiffs.reduce((sum, value) => sum + value, 0) / absDiffs.length : 0,
    averageDifferencePercent:
      pctDiffs.length > 0 ? pctDiffs.reduce((sum, value) => sum + value, 0) / pctDiffs.length : 0,
    maxDifferenceNis: absDiffs.length ? Math.max(...absDiffs) : 0,
    totalTaxiOrders: coverage.totalTaxiOrders,
    moneCoveragePct: coverage.moneCoveragePct,
    p90AbsoluteDifferenceNis: percentile(absDiffs, 0.9),
    p95AbsoluteDifferenceNis: percentile(absDiffs, 0.95),
  };
}

function buildFrequencyByDay(rows: ComparisonEnrichedRow[]): FrequencyByDayPoint[] {
  const counts = new Map<string, number>();
  for (const row of comparableRows(rows)) {
    const key = `${row.day_of_week}::${row.difference_flag}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const output: FrequencyByDayPoint[] = [];
  for (const dayOfWeek of DAY_OF_WEEK_LABELS) {
    for (const differenceFlag of [
      "No difference",
      "Driver price higher",
      "Mone price higher",
    ] as DifferenceFlag[]) {
      output.push({
        dayOfWeek,
        differenceFlag,
        count: counts.get(`${dayOfWeek}::${differenceFlag}`) ?? 0,
      });
    }
  }
  return output;
}

function buildSeverityByDay(rows: ComparisonEnrichedRow[]): SeverityByDayPoint[] {
  const buckets = new Map<DayOfWeekLabel, number[]>();
  for (const row of comparableRows(rows)) {
    const list = buckets.get(row.day_of_week) ?? [];
    list.push(row.absolute_difference_nis);
    buckets.set(row.day_of_week, list);
  }
  return DAY_OF_WEEK_LABELS.map((dayOfWeek) => {
    const values = buckets.get(dayOfWeek) ?? [];
    return {
      dayOfWeek,
      averageAbsoluteDifferenceNis:
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    };
  });
}

function buildHeatmap(rows: ComparisonEnrichedRow[]): HeatmapCell[] {
  const buckets = new Map<string, number[]>();
  for (const row of comparableRows(rows)) {
    const key = `${row.day_of_week}::${row.hour}`;
    const list = buckets.get(key) ?? [];
    list.push(row.absolute_difference_nis);
    buckets.set(key, list);
  }
  const output: HeatmapCell[] = [];
  for (const dayOfWeek of DAY_OF_WEEK_LABELS) {
    for (let hour = 0; hour < 24; hour += 1) {
      const values = buckets.get(`${dayOfWeek}::${hour}`) ?? [];
      output.push({
        dayOfWeek,
        hour,
        count: values.length,
        averageAbsoluteDifferenceNis:
          values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      });
    }
  }
  return output;
}

function buildByDistance(rows: ComparisonEnrichedRow[]): DistanceBucketPoint[] {
  const order = ["0-3 km", "3-5 km", "5-10 km", "10-20 km", "20+ km"] as const;
  const buckets = new Map<string, number[]>();
  for (const row of comparableRows(rows)) {
    if (!row.distance_bucket) continue;
    const list = buckets.get(row.distance_bucket) ?? [];
    list.push(row.absolute_difference_nis);
    buckets.set(row.distance_bucket, list);
  }
  return order.map((distanceBucket) => {
    const values = buckets.get(distanceBucket) ?? [];
    return {
      distanceBucket,
      count: values.length,
      averageAbsoluteDifferenceNis:
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    };
  });
}

function buildScatterSample(rows: ComparisonEnrichedRow[]): ScatterPoint[] {
  const analyticsRows = comparableRows(rows);
  const sample =
    analyticsRows.length <= SCATTER_SAMPLE_SIZE
      ? analyticsRows
      : analyticsRows.filter(
          (_, index) => index % Math.ceil(analyticsRows.length / SCATTER_SAMPLE_SIZE) === 0,
        );
  return sample.slice(0, SCATTER_SAMPLE_SIZE).map((row) => ({
    orderId: row.order_id,
    monePrice: row.mone_price,
    driverPriceWithVat: row.driver_price_with_vat,
    distanceKm: row.distance_km,
    differenceFlag: row.difference_flag,
  }));
}

function buildTrendByDay(rows: ComparisonEnrichedRow[]): TrendPoint[] {
  const buckets = new Map<string, ComparisonEnrichedRow[]>();
  for (const row of comparableRows(rows)) {
    const date = row.order_date.slice(0, 10);
    const list = buckets.get(date) ?? [];
    list.push(row);
    buckets.set(date, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => {
      const mismatch = dayRows.filter((row) => row.difference_flag !== "No difference").length;
      const abs = dayRows.map((row) => row.absolute_difference_nis);
      return {
        date,
        count: dayRows.length,
        mismatchPct: dayRows.length > 0 ? (mismatch / dayRows.length) * 100 : 0,
        averageAbsoluteDifferenceNis:
          abs.length > 0 ? abs.reduce((sum, value) => sum + value, 0) / abs.length : 0,
      };
    });
}

function buildTopProblematicHours(rows: ComparisonEnrichedRow[]): RankedBucket[] {
  const buckets = new Map<number, number[]>();
  for (const row of comparableRows(rows)) {
    const list = buckets.get(row.hour) ?? [];
    list.push(row.absolute_difference_nis);
    buckets.set(row.hour, list);
  }
  return [...buckets.entries()]
    .map(([hour, values]) => ({
      label: `${String(hour).padStart(2, "0")}:00`,
      count: values.length,
      averageAbsoluteDifferenceNis:
        values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
    }))
    .sort((a, b) => b.averageAbsoluteDifferenceNis - a.averageAbsoluteDifferenceNis)
    .slice(0, 5);
}

function buildTopProblematicWeekdays(rows: ComparisonEnrichedRow[]): RankedBucket[] {
  const analyticsRows = comparableRows(rows);
  return buildSeverityByDay(rows)
    .map((point) => ({
      label: point.dayOfWeek,
      count: analyticsRows.filter((row) => row.day_of_week === point.dayOfWeek).length,
      averageAbsoluteDifferenceNis: point.averageAbsoluteDifferenceNis,
    }))
    .sort((a, b) => b.averageAbsoluteDifferenceNis - a.averageAbsoluteDifferenceNis)
    .slice(0, 5);
}

function buildMismatchAlert(rows: ComparisonEnrichedRow[]) {
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const analyticsRows = comparableRows(rows);
  const current = analyticsRows.filter((row) => now - new Date(row.order_date).getTime() <= weekMs);
  const previous = analyticsRows.filter((row) => {
    const age = now - new Date(row.order_date).getTime();
    return age > weekMs && age <= weekMs * 2;
  });
  if (!current.length || !previous.length) return null;

  const currentMismatchPct =
    (current.filter((row) => row.difference_flag !== "No difference").length / current.length) *
    100;
  const previousMismatchPct =
    (previous.filter((row) => row.difference_flag !== "No difference").length / previous.length) *
    100;
  const deltaPctPoints = currentMismatchPct - previousMismatchPct;

  return {
    active: Math.abs(deltaPctPoints) >= 5,
    currentMismatchPct,
    previousMismatchPct,
    deltaPctPoints,
  };
}

export async function buildComparisonSummary(
  rawFilters: Partial<ComparisonFilters>,
): Promise<ComparisonSummaryResponse> {
  const [rows, coverage] = await Promise.all([
    fetchEnrichedRows(rawFilters, SUMMARY_MAX_ROWS),
    getCoverageStats(),
  ]);
  const kpis = buildKpis(rows, coverage);
  const p95 = kpis.p95AbsoluteDifferenceNis;
  const anomalyCount = comparableRows(rows).filter(
    (row) => row.absolute_difference_nis > p95 && p95 > 0,
  ).length;

  return {
    ok: true,
    kpis,
    frequencyByDay: buildFrequencyByDay(rows),
    severityByDay: buildSeverityByDay(rows),
    heatmap: buildHeatmap(rows),
    byDistance: buildByDistance(rows),
    scatterSample: buildScatterSample(rows),
    trendByDay: buildTrendByDay(rows),
    topProblematicHours: buildTopProblematicHours(rows),
    topProblematicWeekdays: buildTopProblematicWeekdays(rows),
    anomalyCount,
    mismatchAlert: buildMismatchAlert(rows),
  };
}

export function toTableRow(row: ComparisonEnrichedRow): ComparisonTableRow {
  return {
    orderId: row.order_id,
    orderDate: row.order_date.slice(0, 10),
    orderTime: row.order_time,
    dayOfWeek: row.day_of_week,
    distanceKm: row.distance_km,
    timeMin: row.time_min,
    driverPriceWithVat: row.driver_price_with_vat,
    monePrice: row.mone_price,
    differenceNis: row.difference_nis,
    differencePercent: row.difference_percent,
    differenceFlag: row.difference_flag,
  };
}

export async function fetchComparisonRowsPage(input: {
  filters: Partial<ComparisonFilters>;
  page: number;
  pageSize: number;
}) {
  const page = Math.max(1, input.page);
  const pageSize = Math.min(200, Math.max(1, input.pageSize));
  const rows = await fetchEnrichedRows(input.filters, EXPORT_MAX_ROWS);
  const sorted = [...rows].sort(
    (a, b) => b.absolute_difference_nis - a.absolute_difference_nis,
  );
  const start = (page - 1) * pageSize;
  const slice = sorted.slice(start, start + pageSize);
  return {
    total: sorted.length,
    page,
    pageSize,
    rows: slice.map(toTableRow),
  };
}

export async function fetchComparisonExportRows(rawFilters: Partial<ComparisonFilters>) {
  const rows = await fetchEnrichedRows(rawFilters, EXPORT_MAX_ROWS);
  return [...rows]
    .sort((a, b) => b.absolute_difference_nis - a.absolute_difference_nis)
    .map(toTableRow);
}

export function rowsToCsv(rows: ComparisonTableRow[]) {
  const headers = [
    "order_date",
    "order_time",
    "day_of_week",
    "distance_km",
    "time_min",
    "driver_price_with_vat",
    "mone_price",
    "difference_nis",
    "difference_percent",
    "difference_flag",
    "order_id",
  ];
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.orderDate,
        row.orderTime,
        row.dayOfWeek,
        row.distanceKm ?? "",
        row.timeMin ?? "",
        row.driverPriceWithVat,
        row.monePrice,
        row.differenceNis,
        row.differencePercent ?? "",
        row.differenceFlag,
        row.orderId,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}
