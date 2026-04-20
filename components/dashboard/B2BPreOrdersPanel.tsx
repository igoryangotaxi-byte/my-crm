"use client";

import { useCallback, useMemo, useState } from "react";
import type { B2BDashboardOrder, B2BOrderDetailsResponse } from "@/types/crm";

type SortMode = "date_desc" | "date_asc" | "client_asc" | "client_desc";
type StatusFilter = "all" | "completed" | "cancelled" | "pending";

type B2BPreOrdersPanelProps = {
  rows: B2BDashboardOrder[];
};

type DashboardSeriesItem = {
  date: string;
  dayLabel: string;
  completed: number;
  cancelled: number;
  spent: number;
  totalTrips: number;
};

type ClientSpendSeriesItem = {
  clientName: string;
  color: string;
  values: number[];
  total: number;
};

const CLIENT_SPEND_COLORS = [
  "#16a34a",
  "#2563eb",
  "#d946ef",
  "#f97316",
  "#14b8a6",
  "#ef4444",
];

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 2,
  }).format(value);
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatTripDuration(startValue: unknown, finishValue: unknown) {
  if (typeof startValue !== "string" || typeof finishValue !== "string") {
    return "Not provided by API";
  }

  const start = new Date(startValue);
  const finish = new Date(finishValue);
  const diffMs = finish.getTime() - start.getTime();

  if (Number.isNaN(start.getTime()) || Number.isNaN(finish.getTime()) || diffMs <= 0) {
    return "Not provided by API";
  }

  const totalMinutes = Math.round(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function formatAxisDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function formatDeltaPercent(current: number, previous: number) {
  if (previous === 0) return "n/a";
  const delta = ((current - previous) / previous) * 100;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}%`;
}

function formatCompactNumber(value: number) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return String(Math.round(value));
}

function formatCompactMoney(value: number) {
  if (value >= 1000) {
    return `₪${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  }
  return `₪${Math.round(value)}`;
}

function TripsCard({
  series,
  totalTrips,
  totalCompleted,
  totalCancelled,
  maxTrips,
  axisStep,
}: {
  series: DashboardSeriesItem[];
  totalTrips: number;
  totalCompleted: number;
  totalCancelled: number;
  maxTrips: number;
  axisStep: number;
}) {
  const [hoveredTripsIndex, setHoveredTripsIndex] = useState<number | null>(null);
  const yTicks = [maxTrips, maxTrips * 0.66, maxTrips * 0.33, 0].map((value) =>
    Math.max(0, Math.round(value)),
  );
  const barsCount = series.length;
  const barGap =
    barsCount <= 7 ? 8 : barsCount <= 14 ? 4 : barsCount <= 31 ? 2 : barsCount <= 60 ? 1 : 0.5;
  const barMaxWidth =
    barsCount <= 7 ? 46 : barsCount <= 14 ? 28 : barsCount <= 31 ? 16 : barsCount <= 60 ? 10 : 6;

  return (
    <article className="relative overflow-hidden rounded-[28px] border border-border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-2xl font-semibold text-slate-900">Trips</p>
        <p className="text-sm font-semibold text-muted">Report</p>
      </div>

      <p className="text-6xl font-semibold tracking-tight text-slate-900">
        {totalTrips.toLocaleString("en-US")}
      </p>

      <p className="mt-2 text-xs text-muted">
        Completed {totalCompleted.toLocaleString("en-US")} / Cancelled{" "}
        {totalCancelled.toLocaleString("en-US")}
      </p>

      <div
        className="mt-5 rounded-2xl border border-border/70 bg-slate-50 p-3"
        onMouseLeave={() => setHoveredTripsIndex(null)}
      >
        <div className="relative h-52 pr-10">
          <div className="pointer-events-none absolute inset-0 grid grid-rows-4">
            <div className="border-b border-slate-200" />
            <div className="border-b border-slate-200" />
            <div className="border-b border-slate-200" />
            <div className="border-b border-slate-200" />
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 flex-col justify-between text-right text-[10px] text-muted">
            {yTicks.map((tick, index) => (
              <span key={`${tick}-${index}`}>{formatCompactNumber(tick)}</span>
            ))}
          </div>

          <div className="relative flex h-44 items-end" style={{ gap: `${barGap}px` }}>
            {series.map((item, index) => {
              const completedHeight = (item.completed / maxTrips) * 100;
              const cancelledHeight = (item.cancelled / maxTrips) * 100;
              const isHovered = hoveredTripsIndex === index;
              const tooltipClass =
                index === 0
                  ? "left-0"
                  : index === series.length - 1
                    ? "right-0"
                    : "left-1/2 -translate-x-1/2";

              return (
                <div
                  key={item.date}
                  className={`relative flex flex-1 flex-col items-center transition-transform duration-150 ${
                    isHovered ? "-translate-y-1.5" : ""
                  }`}
                  onMouseEnter={() => setHoveredTripsIndex(index)}
                >
                  <div className="relative z-10 flex h-40 w-full items-end justify-center">
                    <div
                      className={`flex h-full w-full max-w-[46px] flex-col justify-end gap-1 rounded-lg transition-shadow duration-150 ${
                        isHovered ? "shadow-lg shadow-slate-300/70" : ""
                      }`}
                      style={{ maxWidth: `${barMaxWidth}px` }}
                    >
                      <div
                        className="rounded-t-md bg-rose-500"
                        style={{
                          height: `${Math.max(cancelledHeight, item.cancelled > 0 ? 8 : 0)}%`,
                        }}
                        title={`Cancelled: ${item.cancelled}`}
                      />
                      <div
                        className="rounded-b-md bg-emerald-500"
                        style={{
                          height: `${Math.max(completedHeight, item.completed > 0 ? 8 : 0)}%`,
                        }}
                        title={`Completed: ${item.completed}`}
                      />
                    </div>
                  </div>
                  <span className="mt-2 text-xs text-muted">
                    {index % axisStep === 0 || index === series.length - 1
                      ? formatAxisDate(item.date)
                      : ""}
                  </span>

                  {isHovered ? (
                    <div
                      className={`pointer-events-none absolute -top-28 z-20 w-64 rounded-2xl border border-border bg-white/95 p-3 shadow-xl backdrop-blur-sm ${tooltipClass}`}
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.date}</p>
                      <p className="mt-1 text-sm text-emerald-600">
                        {item.completed.toLocaleString("en-US")} Completed
                      </p>
                      <p className="text-sm text-rose-600">
                        {item.cancelled.toLocaleString("en-US")} Cancelled
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-900">
                        {item.totalTrips.toLocaleString("en-US")} Total
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </article>
  );
}

function ClientSpendCard({
  series,
  totalSpent,
  clientSeries,
  maxClientSpend,
  axisStep,
}: {
  series: DashboardSeriesItem[];
  totalSpent: number;
  clientSeries: ClientSpendSeriesItem[];
  maxClientSpend: number;
  axisStep: number;
}) {
  const [hoveredSpend, setHoveredSpend] = useState<{
    pointIndex: number;
    clientIndex: number;
  } | null>(null);
  const hoveredSpendPoint =
    hoveredSpend !== null
      ? {
          date: series[hoveredSpend.pointIndex]?.date ?? "",
          clientName: clientSeries[hoveredSpend.clientIndex]?.clientName ?? "",
          color: clientSeries[hoveredSpend.clientIndex]?.color ?? "#16a34a",
          value: clientSeries[hoveredSpend.clientIndex]?.values[hoveredSpend.pointIndex] ?? 0,
          previous:
            hoveredSpend.pointIndex > 0
              ? (clientSeries[hoveredSpend.clientIndex]?.values[hoveredSpend.pointIndex - 1] ?? 0)
              : (clientSeries[hoveredSpend.clientIndex]?.values[hoveredSpend.pointIndex] ?? 0),
        }
      : null;
  const yTicks = [maxClientSpend, maxClientSpend * 0.66, maxClientSpend * 0.33, 0].map((value) =>
    Math.max(0, Math.round(value)),
  );
  const pointsCount = series.length;
  const lineStrokeWidth = pointsCount > 60 ? 1 : pointsCount > 31 ? 1.2 : 1.6;
  const pointRadius = pointsCount > 60 ? 0.7 : pointsCount > 31 ? 1 : 1.8;
  const hitRadius = pointsCount > 60 ? 2 : pointsCount > 31 ? 2.8 : 4;

  return (
    <article className="relative overflow-hidden rounded-[28px] border border-border bg-white p-5 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-2xl font-semibold text-slate-900">Client spend</p>
        <p className="text-sm font-semibold text-muted">Report</p>
      </div>

      <p className="text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl">
        {formatMoney(totalSpent)}
      </p>
      <p className="mt-2 text-xs text-muted">Money paid by clients for selected period</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {clientSeries.map((client) => (
          <span
            key={client.clientName}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-slate-50 px-2 py-0.5 text-[10px] text-slate-700"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: client.color }}
            />
            {client.clientName}
          </span>
        ))}
      </div>

      <div
        className="mt-5 rounded-2xl border border-border/70 bg-slate-50 p-3"
        onMouseLeave={() => setHoveredSpend(null)}
      >
        <div className="relative h-52 pr-10">
          <div className="pointer-events-none absolute inset-0 grid grid-rows-4">
            <div className="border-b border-slate-200" />
            <div className="border-b border-slate-200" />
            <div className="border-b border-slate-200" />
            <div className="border-b border-slate-200" />
          </div>

          <div className="pointer-events-none absolute inset-y-0 right-0 flex w-10 flex-col justify-between text-right text-[10px] text-muted">
            {yTicks.map((tick, index) => (
              <span key={`${tick}-${index}`}>{formatCompactMoney(tick)}</span>
            ))}
          </div>

          <svg viewBox="0 0 100 38" className="relative h-44 w-[calc(100%-2.5rem)]">
            {hoveredSpend !== null ? (
              <line
                x1={series.length > 1 ? (hoveredSpend.pointIndex / (series.length - 1)) * 96 + 2 : 50}
                x2={series.length > 1 ? (hoveredSpend.pointIndex / (series.length - 1)) * 96 + 2 : 50}
                y1="2"
                y2="34"
                stroke="#94a3b8"
                strokeWidth="0.4"
              />
            ) : null}

            {clientSeries.map((client, clientIndex) => (
              <g key={client.clientName}>
                <polyline
                  fill="none"
                  stroke={client.color}
                  strokeWidth={lineStrokeWidth}
                  points={client.values
                    .map((value, index, array) => {
                      const x = array.length > 1 ? (index / (array.length - 1)) * 96 + 2 : 50;
                      const y = 34 - (value / maxClientSpend) * 28;
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
                {client.values.map((value, pointIndex, array) => {
                  const x = array.length > 1 ? (pointIndex / (array.length - 1)) * 96 + 2 : 50;
                  const y = 34 - (value / maxClientSpend) * 28;
                  return (
                    <g key={`${client.clientName}-${series[pointIndex]?.date ?? pointIndex}`}>
                      <circle cx={x} cy={y} r={pointRadius} fill={client.color} />
                      <circle
                        cx={x}
                        cy={y}
                        r={hitRadius}
                        fill="transparent"
                        onMouseEnter={() => setHoveredSpend({ pointIndex, clientIndex })}
                      />
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>

          <div className="mt-2 flex w-[calc(100%-2.5rem)] items-center gap-1 text-[10px] text-muted">
            {series.map((item, index) => (
              <span key={item.date} className="flex-1 text-center">
                {index % axisStep === 0 || index === series.length - 1
                  ? formatAxisDate(item.date)
                  : ""}
              </span>
            ))}
          </div>
        </div>
      </div>

      {hoveredSpendPoint ? (
        <div className="pointer-events-none absolute right-4 top-24 w-72 rounded-2xl border border-border bg-white/95 p-3 shadow-xl backdrop-blur-sm">
          <p className="text-sm font-semibold text-slate-900">{hoveredSpendPoint.date}</p>
          <p className="mt-1 text-xs" style={{ color: hoveredSpendPoint.color }}>
            {hoveredSpendPoint.clientName}
          </p>
          <p className="text-base font-semibold text-slate-900">
            {formatMoney(hoveredSpendPoint.value)}
          </p>
          <p className="text-xs text-muted">
            Delta vs prev: {formatDeltaPercent(hoveredSpendPoint.value, hoveredSpendPoint.previous)}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function resolveDashboardStatus(row: B2BDashboardOrder): Exclude<StatusFilter, "all"> {
  if (row.status === "completed") return "completed";
  if (row.status === "cancelled") return "cancelled";

  const scheduledTs = new Date(row.scheduledAt).getTime();
  if (!Number.isNaN(scheduledTs) && scheduledTs > Date.now()) {
    return "pending";
  }

  return "cancelled";
}

export function B2BPreOrdersPanel({ rows }: B2BPreOrdersPanelProps) {
  const [fromDate, setFromDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toDateInputValue(date);
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date()));
  const [clientFilter, setClientFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [selectedOrder, setSelectedOrder] = useState<B2BDashboardOrder | null>(null);
  const [orderDetails, setOrderDetails] = useState<B2BOrderDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const clientOptions = useMemo(
    () => ["all", ...new Set(rows.map((row) => row.clientName))],
    [rows],
  );

  const scopedRows = useMemo(() => {
    return rows.filter((row) => {
      if (clientFilter !== "all" && row.clientName !== clientFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, clientFilter, statusFilter]);

  const filteredRows = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`) : null;

    const result = scopedRows.filter((row) => {
      const scheduledDate = new Date(row.scheduledAt);
      if (Number.isNaN(scheduledDate.getTime())) return false;
      if (from && scheduledDate < from) return false;
      if (to && scheduledDate > to) return false;
      return true;
    });

    result.sort((a, b) => {
      if (sortMode === "date_desc") {
        return new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime();
      }
      if (sortMode === "date_asc") {
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
      }
      if (sortMode === "client_asc") return a.clientName.localeCompare(b.clientName);
      return b.clientName.localeCompare(a.clientName);
    });

    return result;
  }, [scopedRows, fromDate, toDate, sortMode]);

  const dashboardData = useMemo(() => {
    const byDate = new Map<
      string,
      {
        completed: number;
        cancelled: number;
        spent: number;
      }
    >();
    const clientSpendByDate = new Map<string, Map<string, number>>();
    const clientSpendTotals = new Map<string, number>();

    for (const row of filteredRows) {
      const dateKey = row.scheduledAt.slice(0, 10);
      const prev = byDate.get(dateKey) ?? {
        completed: 0,
        cancelled: 0,
        spent: 0,
      };

      const status = resolveDashboardStatus(row);
      if (status === "completed") prev.completed += 1;
      if (status === "cancelled") prev.cancelled += 1;
      prev.spent += row.clientPaid;
      byDate.set(dateKey, prev);

      const dateClientMap = clientSpendByDate.get(dateKey) ?? new Map<string, number>();
      dateClientMap.set(row.clientName, (dateClientMap.get(row.clientName) ?? 0) + row.clientPaid);
      clientSpendByDate.set(dateKey, dateClientMap);
      clientSpendTotals.set(row.clientName, (clientSpendTotals.get(row.clientName) ?? 0) + row.clientPaid);
    }

    const series = [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, values]) => {
        const dateObj = new Date(`${date}T00:00:00`);
        return {
          date,
          dayLabel: new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(dateObj),
          completed: values.completed,
          cancelled: values.cancelled,
          spent: values.spent,
          totalTrips: values.completed + values.cancelled,
        };
      });

    const totalCompleted = series.reduce((sum, item) => sum + item.completed, 0);
    const totalCancelled = series.reduce((sum, item) => sum + item.cancelled, 0);
    const totalTrips = series.reduce((sum, item) => sum + item.totalTrips, 0);
    const totalSpent = series.reduce((sum, item) => sum + item.spent, 0);

    const topClients = [...clientSpendTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([clientName]) => clientName);

    const clientSeries: ClientSpendSeriesItem[] = topClients.map((clientName, index) => {
      const values = series.map((item) => clientSpendByDate.get(item.date)?.get(clientName) ?? 0);
      return {
        clientName,
        color: CLIENT_SPEND_COLORS[index % CLIENT_SPEND_COLORS.length],
        values,
        total: values.reduce((sum, value) => sum + value, 0),
      };
    });

    const maxTrips = Math.max(1, ...series.map((item) => item.completed + item.cancelled));
    const maxSpent = Math.max(
      1,
      ...series.map((item) => item.spent),
      ...clientSeries.flatMap((client) => client.values),
    );
    const axisStep = Math.max(1, Math.ceil(series.length / 8));

    return {
      series,
      totalCompleted,
      totalCancelled,
      totalTrips,
      totalSpent,
      maxTrips,
      maxSpent,
      axisStep,
      clientSeries,
    };
  }, [filteredRows]);

  const openOrderModal = useCallback(async (row: B2BDashboardOrder) => {
    setSelectedOrder(row);
    setOrderDetails(null);
    setDetailsError(null);
    setDetailsLoading(true);

    if (!row.clientId) {
      setDetailsLoading(false);
      setDetailsError("Client ID is missing for this order");
      return;
    }

    try {
      const response = await fetch("/api/b2b-order-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: row.tokenLabel,
          clientId: row.clientId,
          orderId: row.orderId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setOrderDetails((await response.json()) as B2BOrderDetailsResponse);
    } catch (error) {
      setDetailsError(error instanceof Error ? error.message : "Failed to load order details");
    } finally {
      setDetailsLoading(false);
    }
  }, []);

  const closeOrderModal = () => {
    setSelectedOrder(null);
    setOrderDetails(null);
    setDetailsError(null);
    setDetailsLoading(false);
    setCopiedField(null);
  };

  const copyToClipboard = async (fieldKey: string, value?: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField((prev) => (prev === fieldKey ? null : prev)), 1200);
    } catch {
      // Ignore clipboard errors for now.
    }
  };

  const info = orderDetails?.info;
  const progress = orderDetails?.progress;
  const report = orderDetails?.report;

  const performer =
    info && typeof info.performer === "object" && info.performer !== null
      ? (info.performer as Record<string, unknown>)
      : null;
  const vehicle =
    performer && typeof performer.vehicle === "object" && performer.vehicle !== null
      ? (performer.vehicle as Record<string, unknown>)
      : null;
  const cancelRules =
    info && typeof info.cancel_rules === "object" && info.cancel_rules !== null
      ? (info.cancel_rules as Record<string, unknown>)
      : null;

  const getValue = (value: unknown) => {
    if (value === null || value === undefined || value === "") return "Not provided by API";
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }
    return JSON.stringify(value);
  };

  return (
    <>
    <section className="glass-surface mt-6 rounded-3xl p-4">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">B2B Pre-orders</h2>
          <p className="text-sm text-muted">
            Trips and spending dashboards in unified style
          </p>
        </div>

        <div className="grid w-full gap-2 sm:w-auto sm:grid-flow-col sm:auto-cols-max sm:items-end">
          <label className="text-xs text-muted">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="mt-1 block h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 sm:w-auto"
            />
          </label>
          <label className="text-xs text-muted">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="mt-1 block h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 sm:w-auto"
            />
          </label>
          <label className="text-xs text-muted">
            Client
            <select
              value={clientFilter}
              onChange={(event) => setClientFilter(event.target.value)}
              className="mt-1 block h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 sm:w-auto"
            >
              {clientOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All clients" : option}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="mt-1 block h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 sm:w-auto"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="pending">Pending</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Sort
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="mt-1 block h-9 w-full rounded-lg border border-border bg-white px-2.5 text-sm text-slate-700 sm:w-auto"
            >
              <option value="date_desc">Date desc</option>
              <option value="date_asc">Date asc</option>
              <option value="client_asc">Client A-Z</option>
              <option value="client_desc">Client Z-A</option>
            </select>
          </label>
        </div>
      </div>

      <div className="mb-4 grid gap-4 xl:grid-cols-2">
        <TripsCard
          series={dashboardData.series}
          totalTrips={dashboardData.totalTrips}
          totalCompleted={dashboardData.totalCompleted}
          totalCancelled={dashboardData.totalCancelled}
          maxTrips={dashboardData.maxTrips}
          axisStep={dashboardData.axisStep}
        />
        <ClientSpendCard
          series={dashboardData.series}
          totalSpent={dashboardData.totalSpent}
          clientSeries={dashboardData.clientSeries}
          maxClientSpend={dashboardData.maxSpent}
          axisStep={dashboardData.axisStep}
        />
      </div>
    </section>

    <section className="glass-surface mt-4 rounded-3xl p-4">
      <div className="mb-3">
        <h3 className="text-lg font-semibold text-slate-900">Orders</h3>
        <p className="text-sm text-muted">Detailed B2B orders list</p>
      </div>
      <div className="glass-surface overflow-hidden rounded-3xl">
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead className="bg-[#f6f6f8]">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Order
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Client
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Scheduled at
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Client paid
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Driver received
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted">
                  Decoupling
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRows.map((row) => {
                const displayStatus = row.status;
                return (
                  <tr
                    key={`${row.tokenLabel}:${row.orderId}`}
                    className="cursor-pointer hover:bg-[#fafafb]"
                    onClick={() => openOrderModal(row)}
                  >
                    <td className="px-3 py-2 text-sm font-medium text-slate-900">{row.orderId}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{row.clientName}</td>
                    <td className="px-3 py-2 text-sm">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          displayStatus === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : displayStatus === "cancelled"
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {displayStatus}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">{row.scheduledAt}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">{formatMoney(row.clientPaid)}</td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {formatMoney(row.driverReceived)}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {formatMoney(row.decoupling)}
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-muted">
                    No orders for selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4 py-8 backdrop-blur-sm"
          onClick={closeOrderModal}
        >
          <div
            className="w-full max-w-4xl rounded-3xl border border-slate-200 bg-white/96 p-4 shadow-2xl backdrop-blur-xl lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 px-1">
              <h3 className="text-xl font-semibold text-foreground">B2B Order {selectedOrder.orderId}</h3>
              <button
                type="button"
                onClick={closeOrderModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-lg font-semibold leading-none text-slate-700 transition hover:bg-slate-200"
                aria-label="Close modal"
              >
                ×
              </button>
            </div>

            {detailsLoading ? (
              <div className="rounded-2xl border border-border bg-white px-4 py-10 text-center text-sm text-muted">
                Loading order details...
              </div>
            ) : detailsError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {detailsError}
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <section className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-[#f8f9fb] p-4">
                    <h4 className="mb-3 text-xl font-semibold text-slate-900">Route</h4>
                    <dl className="space-y-3 text-sm">
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Point A</dt>
                        <dd className="font-medium text-slate-900">{selectedOrder.pointA}</dd>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Point B</dt>
                        <dd className="font-medium text-slate-900">{selectedOrder.pointB}</dd>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Scheduled at</dt>
                        <dd className="font-medium text-slate-900">{selectedOrder.scheduledAt}</dd>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Status</dt>
                        <dd className="font-medium text-slate-900">{selectedOrder.statusRaw}</dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-3xl border border-slate-200 bg-[#f8f9fb] p-4">
                    <h4 className="mb-3 text-lg font-semibold text-slate-900">Driver & Vehicle</h4>
                    <dl className="grid gap-2 text-sm md:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Driver full name</dt>
                        <dd className="font-medium text-slate-900">{getValue(performer?.fullname)}</dd>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Driver phone</dt>
                        <dd className="font-medium text-slate-900">{getValue(performer?.phone)}</dd>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Vehicle model</dt>
                        <dd className="font-medium text-slate-900">{getValue(vehicle?.model)}</dd>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-2.5">
                        <dt className="text-muted">Vehicle number</dt>
                        <dd className="font-medium text-slate-900">{getValue(vehicle?.number)}</dd>
                      </div>
                    </dl>
                  </div>
                </section>

                <aside className="rounded-3xl border border-slate-200 bg-[#f8f9fb] p-4">
                  <h4 className="mb-4 text-2xl font-semibold text-slate-900">Details</h4>
                  <dl className="space-y-3 text-sm">
                    <div>
                      <dt className="text-muted">Order ID</dt>
                      <dd className="font-medium text-slate-900">
                        <button
                          type="button"
                          onClick={() => copyToClipboard("orderId", selectedOrder.orderId)}
                          className="relative inline-flex cursor-copy items-center rounded-lg bg-white px-2.5 py-1 transition hover:bg-slate-100"
                        >
                          <span>{selectedOrder.orderId}</span>
                          {copiedField === "orderId" ? (
                            <span className="absolute -top-7 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-white">
                              Copied
                            </span>
                          ) : null}
                        </button>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Client</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.clientName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Client paid</dt>
                      <dd className="font-medium text-slate-900">{formatMoney(selectedOrder.clientPaid)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Driver received</dt>
                      <dd className="font-medium text-slate-900">
                        {formatMoney(selectedOrder.driverReceived)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Decoupling</dt>
                      <dd className="font-medium text-slate-900">{formatMoney(selectedOrder.decoupling)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Progress status</dt>
                      <dd className="font-medium text-slate-900">{getValue(progress?.status)}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Actual distance (km)</dt>
                      <dd className="font-medium text-slate-900">
                        {typeof report?.distance === "number"
                          ? (report.distance / 1000).toFixed(2)
                          : "Not provided by API"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Actual trip time</dt>
                      <dd className="font-medium text-slate-900">
                        {formatTripDuration(report?.start_datetime, report?.finish_datetime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">Cancel rules</dt>
                      <dd className="font-medium text-slate-900">{getValue(cancelRules?.title)}</dd>
                    </div>
                  </dl>

                  <details className="mt-4 rounded-xl border border-border bg-white p-2.5">
                    <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted">
                      Raw API payload
                    </summary>
                    <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100">
{JSON.stringify({ info, progress, report }, null, 2)}
                    </pre>
                  </details>
                </aside>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
