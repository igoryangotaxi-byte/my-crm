"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DAY_OF_WEEK_LABELS,
  DIFFERENCE_FLAGS,
  DISTANCE_BUCKETS,
  type DayOfWeekLabel,
  type DifferenceFlag,
} from "@/lib/driver-price-comparison/calculated-fields";
import type {
  ComparisonFilters,
  ComparisonSummaryResponse,
  ComparisonTableRow,
} from "@/lib/driver-price-comparison/types";
import { ComparisonChartShell } from "@/components/price-calculator/charts/ComparisonChartShell";

const FLAG_COLORS: Record<DifferenceFlag, string> = {
  "No difference": "#16a34a",
  "Driver price higher": "#dc2626",
  "Mone price higher": "#ea580c",
  "No price": "#94a3b8",
};

type DataStatus = {
  totalTaxiOrders: number;
  ridesWithMone: number;
  moneCoveragePct: number;
  lastSyncAt: string | null;
};

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function defaultFilters(): ComparisonFilters {
  const till = new Date();
  const since = new Date();
  since.setDate(since.getDate() - 30);
  return {
    since: since.toISOString(),
    till: till.toISOString(),
    dayOfWeek: [],
    hour: [],
    distanceBucket: [],
    differenceFlag: [],
    corpClientId: null,
  };
}

export function DriverPriceComparisonDashboard() {
  const [filters, setFilters] = useState<ComparisonFilters>(() => defaultFilters());
  const [draft, setDraft] = useState<ComparisonFilters>(() => defaultFilters());
  const [summary, setSummary] = useState<ComparisonSummaryResponse | null>(null);
  const [tableRows, setTableRows] = useState<ComparisonTableRow[]>([]);
  const [tableTotal, setTableTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingTable, setLoadingTable] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [status, setStatus] = useState<DataStatus | null>(null);

  const loadStatus = useCallback(async () => {
    const response = await fetch("/api/price-calculator/driver-price-comparison/status", {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      ok?: boolean;
      coverage?: { totalTaxiOrders: number; ridesWithMone: number; moneCoveragePct: number };
      lastSyncAt?: string | null;
      schemaMissing?: boolean;
      error?: string;
    };
    if (!payload.ok) {
      if (payload.schemaMissing) {
        setSchemaMissing(true);
        setError(payload.error ?? "Database schema is not applied yet.");
      }
      return;
    }
    setSchemaMissing(false);
    if (payload.coverage) {
      setStatus({
        totalTaxiOrders: payload.coverage.totalTaxiOrders,
        ridesWithMone: payload.coverage.ridesWithMone,
        moneCoveragePct: payload.coverage.moneCoveragePct,
        lastSyncAt: payload.lastSyncAt ?? null,
      });
    }
  }, []);

  const loadSummary = useCallback(async (activeFilters: ComparisonFilters) => {
    setLoadingSummary(true);
    setError(null);
    try {
      const response = await fetch("/api/price-calculator/driver-price-comparison/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(activeFilters),
      });
      const payload = (await response.json()) as ComparisonSummaryResponse & { error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load summary.");
      }
      setSummary(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load summary.");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const loadTable = useCallback(async (activeFilters: ComparisonFilters, nextPage: number) => {
    setLoadingTable(true);
    try {
      const response = await fetch("/api/price-calculator/driver-price-comparison/rows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...activeFilters, page: nextPage, pageSize: 50 }),
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        rows?: ComparisonTableRow[];
        total?: number;
        error?: string;
      };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to load table.");
      }
      setTableRows(payload.rows ?? []);
      setTableTotal(payload.total ?? 0);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load table.");
    } finally {
      setLoadingTable(false);
    }
  }, []);

  const refresh = useCallback(
    async (activeFilters: ComparisonFilters, nextPage = 1) => {
      await Promise.all([loadSummary(activeFilters), loadTable(activeFilters, nextPage), loadStatus()]);
    },
    [loadSummary, loadTable, loadStatus],
  );

  useEffect(() => {
    void refresh(filters, page);
  }, [filters, page, refresh]);

  const frequencyChartData = useMemo(() => {
    if (!summary) return [];
    return DAY_OF_WEEK_LABELS.map((day) => {
      const row: Record<string, string | number> = { dayOfWeek: day };
      for (const flag of DIFFERENCE_FLAGS) {
        row[flag] =
          summary.frequencyByDay.find(
            (item) => item.dayOfWeek === day && item.differenceFlag === flag,
          )?.count ?? 0;
      }
      return row;
    });
  }, [summary]);

  const heatmapMax = useMemo(() => {
    if (!summary?.heatmap.length) return 1;
    return Math.max(...summary.heatmap.map((cell) => cell.averageAbsoluteDifferenceNis), 0.01);
  }, [summary]);

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch("/api/price-calculator/driver-price-comparison/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filters),
      });
      if (!response.ok) throw new Error("Export failed.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `driver-price-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  function applyChartFilter(partial: Partial<ComparisonFilters>) {
    const next = { ...filters, ...partial };
    setFilters(next);
    setDraft(next);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil(tableTotal / 50));
  const isEmpty = !loadingSummary && (summary?.kpis.totalRides ?? 0) === 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Driver vs Mone price analytics</h2>
        <p className="mt-1 text-sm text-slate-600">
          Compare synced driver_price_with_vat against imported taxitariff.co.il mone_price.
        </p>
      </div>

      {status ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/70 bg-white/85 p-3 text-sm">
            <p className="text-slate-500">Taxi orders in DB</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">{status.totalTaxiOrders}</p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 p-3 text-sm">
            <p className="text-slate-500">Rides with mone price</p>
            <p className="mt-1 text-xl font-semibold text-slate-900">
              {status.ridesWithMone} ({status.moneCoveragePct.toFixed(1)}%)
            </p>
          </div>
          <div className="rounded-xl border border-white/70 bg-white/85 p-3 text-sm">
            <p className="text-slate-500">Last GP sync</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : "Not synced yet"}
            </p>
          </div>
        </div>
      ) : null}

      {summary?.mismatchAlert?.active ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          Mismatch rate changed by {summary.mismatchAlert.deltaPctPoints.toFixed(1)} pp week-over-week (
          {summary.mismatchAlert.previousMismatchPct.toFixed(1)}% →{" "}
          {summary.mismatchAlert.currentMismatchPct.toFixed(1)}%).
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/70 bg-white/75 p-4">
        <h3 className="text-sm font-semibold text-slate-900">Filters</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Since</span>
            <input
              type="date"
              className="crm-input h-10 w-full px-2"
              value={draft.since?.slice(0, 10) ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  since: event.target.value ? `${event.target.value}T00:00:00.000Z` : null,
                }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-slate-700">Till</span>
            <input
              type="date"
              className="crm-input h-10 w-full px-2"
              value={draft.till?.slice(0, 10) ?? ""}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  till: event.target.value ? `${event.target.value}T23:59:59.999Z` : null,
                }))
              }
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-slate-700">Difference flag</span>
            <select
              multiple
              className="crm-input min-h-10 w-full px-2 py-1 text-sm"
              value={draft.differenceFlag ?? []}
              onChange={(event) =>
                setDraft((prev) => ({
                  ...prev,
                  differenceFlag: [...event.target.selectedOptions].map(
                    (option) => option.value as DifferenceFlag,
                  ),
                }))
              }
            >
              {DIFFERENCE_FLAGS.map((flag) => (
                <option key={flag} value={flag}>
                  {flag}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="crm-button-primary px-4 py-2 text-sm"
            onClick={() => {
              setFilters(draft);
              setPage(1);
            }}
          >
            Apply filters
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
            onClick={() => {
              const reset = defaultFilters();
              setDraft(reset);
              setFilters(reset);
              setPage(1);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-700"
            disabled={exporting}
            onClick={() => void handleExport()}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {schemaMissing ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Database setup required</p>
          <p className="mt-1">
            Open file <code className="rounded bg-amber-100 px-1">scripts/sql/supabase_driver_price_comparison.sql</code>{" "}
            in the repo, copy all SQL from it, paste into Supabase → SQL Editor, and click Run.
          </p>
          <p className="mt-1 text-xs">
            Or locally: set <code className="rounded bg-amber-100 px-1">SUPABASE_DB_URL</code> and run{" "}
            <code className="rounded bg-amber-100 px-1">npm run db:apply:driver-price-comparison</code>
          </p>
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[
          { label: "Total rides", value: summary?.kpis.totalRides ?? 0, format: "number" },
          { label: "Rides with difference", value: summary?.kpis.ridesWithDifference ?? 0, format: "number" },
          {
            label: "% rides with difference",
            value: summary?.kpis.ridesWithDifferencePct ?? 0,
            format: "pct",
          },
          {
            label: "Avg absolute diff (NIS)",
            value: summary?.kpis.averageAbsoluteDifferenceNis ?? 0,
            format: "money",
          },
          {
            label: "Avg difference %",
            value: summary?.kpis.averageDifferencePercent ?? 0,
            format: "pct",
          },
          { label: "Max difference (NIS)", value: summary?.kpis.maxDifferenceNis ?? 0, format: "money" },
          { label: "P90 abs diff", value: summary?.kpis.p90AbsoluteDifferenceNis ?? 0, format: "money" },
          { label: "P95 abs diff", value: summary?.kpis.p95AbsoluteDifferenceNis ?? 0, format: "money" },
          { label: "Anomalies (>P95)", value: summary?.anomalyCount ?? 0, format: "number" },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-white/70 bg-white/85 p-4">
            <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">
              {card.format === "money"
                ? money(Number(card.value))
                : card.format === "pct"
                  ? `${Number(card.value).toFixed(1)}%`
                  : Number(card.value).toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <ComparisonChartShell
          title="Price difference frequency by day"
          description="Ride count by weekday, split by which price is higher."
          loading={loadingSummary}
          empty={isEmpty}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={frequencyChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="dayOfWeek" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              {DIFFERENCE_FLAGS.map((flag) => (
                <Bar
                  key={flag}
                  dataKey={flag}
                  stackId="a"
                  fill={FLAG_COLORS[flag]}
                  onClick={(data) => {
                    const payload = data as { dayOfWeek?: DayOfWeekLabel };
                    if (payload.dayOfWeek) {
                      applyChartFilter({
                        dayOfWeek: [payload.dayOfWeek],
                        differenceFlag: [flag],
                      });
                    }
                  }}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ComparisonChartShell>

        <ComparisonChartShell
          title="Price difference severity by day"
          description="Average absolute difference (NIS) per weekday."
          loading={loadingSummary}
          empty={isEmpty}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary?.severityByDay ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="dayOfWeek" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value: number) => money(value)} />
              <Bar
                dataKey="averageAbsoluteDifferenceNis"
                fill="#64748b"
                onClick={(data) => {
                  const payload = data as { dayOfWeek?: DayOfWeekLabel };
                  if (payload.dayOfWeek) applyChartFilter({ dayOfWeek: [payload.dayOfWeek] });
                }}
              />
            </BarChart>
          </ResponsiveContainer>
        </ComparisonChartShell>
      </div>

      <ComparisonChartShell
        title="Day + hour heatmap"
        description="Average absolute difference by hour (rows) and weekday (columns). Click a cell to filter."
        loading={loadingSummary}
        empty={isEmpty}
      >
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="px-2 py-1 text-left text-slate-500">Hour</th>
                {DAY_OF_WEEK_LABELS.map((day) => (
                  <th key={day} className="px-2 py-1 text-left text-slate-600">
                    {day.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 24 }, (_, hour) => (
                <tr key={hour}>
                  <td className="px-2 py-1 font-medium text-slate-700">{String(hour).padStart(2, "0")}:00</td>
                  {DAY_OF_WEEK_LABELS.map((day) => {
                    const cell = summary?.heatmap.find(
                      (item) => item.dayOfWeek === day && item.hour === hour,
                    );
                    const intensity = (cell?.averageAbsoluteDifferenceNis ?? 0) / heatmapMax;
                    const bg =
                      cell && cell.count > 0
                        ? `rgba(220, 38, 38, ${Math.min(0.85, 0.15 + intensity * 0.7)})`
                        : "#f8fafc";
                    return (
                      <td
                        key={`${day}-${hour}`}
                        className="cursor-pointer px-2 py-1"
                        style={{ backgroundColor: bg }}
                        title={
                          cell
                            ? `${money(cell.averageAbsoluteDifferenceNis)} · ${cell.count} rides`
                            : "No rides"
                        }
                        onClick={() => applyChartFilter({ dayOfWeek: [day], hour: [hour] })}
                      >
                        {cell?.count ? cell.averageAbsoluteDifferenceNis.toFixed(1) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ComparisonChartShell>

      <div className="grid gap-4 xl:grid-cols-2">
        <ComparisonChartShell
          title="Difference by distance"
          description="Average absolute difference and ride volume by distance bucket."
          loading={loadingSummary}
          empty={isEmpty}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={summary?.byDistance ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="distanceBucket" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="averageAbsoluteDifferenceNis"
                name="Avg abs diff"
                fill="#0f766e"
                onClick={(data) => {
                  const payload = data as { distanceBucket?: (typeof DISTANCE_BUCKETS)[number] };
                  if (payload.distanceBucket) {
                    applyChartFilter({ distanceBucket: [payload.distanceBucket] });
                  }
                }}
              />
              <Bar yAxisId="right" dataKey="count" name="Ride count" fill="#94a3b8" />
            </BarChart>
          </ResponsiveContainer>
        </ComparisonChartShell>

        <ComparisonChartShell
          title="Driver vs Mone scatter"
          description="Each point is a ride. Bubble size reflects distance. Color shows difference flag."
          loading={loadingSummary}
          empty={isEmpty}
        >
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" dataKey="monePrice" name="Mone price" tick={{ fontSize: 11 }} />
              <YAxis type="number" dataKey="driverPriceWithVat" name="Driver price" tick={{ fontSize: 11 }} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} />
              <Scatter data={summary?.scatterSample ?? []} fill="#64748b">
                {(summary?.scatterSample ?? []).map((point) => (
                  <Cell key={point.orderId} fill={FLAG_COLORS[point.differenceFlag]} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </ComparisonChartShell>
      </div>

      {(summary?.topProblematicHours.length || summary?.topProblematicWeekdays.length) ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Top problematic hours</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {summary?.topProblematicHours.map((item) => (
                <li key={item.label}>
                  {item.label} · {money(item.averageAbsoluteDifferenceNis)} · {item.count} rides
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
            <h3 className="text-sm font-semibold text-slate-900">Top problematic weekdays</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {summary?.topProblematicWeekdays.map((item) => (
                <li key={item.label}>
                  {item.label} · {money(item.averageAbsoluteDifferenceNis)} · {item.count} rides
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/70 bg-white/80 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-slate-900">Detailed rides</h3>
          <p className="text-xs text-slate-500">Sorted by absolute difference (desc)</p>
        </div>
        {loadingTable ? (
          <p className="text-sm text-slate-500">Loading table…</p>
        ) : tableRows.length === 0 ? (
          <p className="text-sm text-slate-500">No rides match the current filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {[
                    "Date",
                    "Time",
                    "Day",
                    "Km",
                    "Min",
                    "Driver",
                    "Mone",
                    "Diff NIS",
                    "Diff %",
                    "Flag",
                  ].map((header) => (
                    <th key={header} className="px-2 py-2 font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <tr key={row.orderId} className="border-t border-slate-100">
                    <td className="px-2 py-1.5">{row.orderDate}</td>
                    <td className="px-2 py-1.5">{row.orderTime}</td>
                    <td className="px-2 py-1.5">{row.dayOfWeek}</td>
                    <td className="px-2 py-1.5">{row.distanceKm ?? "—"}</td>
                    <td className="px-2 py-1.5">{row.timeMin ?? "—"}</td>
                    <td className="px-2 py-1.5">{money(row.driverPriceWithVat)}</td>
                    <td className="px-2 py-1.5">{money(row.monePrice)}</td>
                    <td className="px-2 py-1.5">{money(row.differenceNis)}</td>
                    <td className="px-2 py-1.5">
                      {row.differencePercent === null ? "—" : `${row.differencePercent.toFixed(1)}%`}
                    </td>
                    <td className="px-2 py-1.5">{row.differenceFlag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex items-center justify-between text-sm text-slate-600">
          <span>
            Page {page} / {pageCount} · {tableTotal} rows
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1"
              disabled={page <= 1}
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            >
              Previous
            </button>
            <button
              type="button"
              className="rounded-lg border border-slate-200 px-3 py-1"
              disabled={page >= pageCount}
              onClick={() => setPage((prev) => Math.min(pageCount, prev + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
