"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { CheckSquare, Download, HandCoins, Split, Wallet, X } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { b2bDashboardOrderKey, type B2BOrdersListCursors } from "@/lib/b2b-orders-keys";
import { StatTile } from "@/components/ui/StatTile";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Dialog";
import { useAuth } from "@/components/auth/AuthProvider";
import type { GpTripsImportResult } from "@/lib/gp-trips-import";
import {
  getAccountManagerUserOptions,
  getSalesManagerUserOptions,
} from "@/lib/sales-operation/crm-manager-users";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type {
  B2BDashboardOrder,
  B2BOrderDetailsResponse,
  YangoSupabaseOrderMetric,
} from "@/types/crm";
import { buildSalesOperationB2BClientTripsHref } from "@/lib/sales-operation/b2b-client-trips-href";

type SortMode = "date_desc" | "date_asc" | "client_asc" | "client_desc";
type StatusFilter = "all" | "completed" | "cancelled" | "pending" | "in_progress";

export type B2BOrdersRemoteConfig = {
  range: { since: string; till: string; fromDateStr: string; toDateStr: string };
  initialCursors: B2BOrdersListCursors;
  initialHasMore: boolean;
  bootstrapErrors?: string[];
};

type B2BPreOrdersPanelProps = {
  rows: B2BDashboardOrder[];
  yangoRows?: YangoSupabaseOrderMetric[];
  view?: "dashboard" | "orders" | "b2bClientsOverview";
  corpClientNameMap?: Record<string, string>;
  b2bClientRegistry?: B2BClientRegistryEntry[];
  onB2BRegistryUpdated?: () => void;
  /** Progressive Yango list+report loading for the Orders page */
  ordersRemote?: B2BOrdersRemoteConfig;
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

type YangoMetricsRow = Pick<
  YangoSupabaseOrderMetric,
  | "orderId"
  | "scheduledAt"
  | "corpClientId"
  | "clientName"
  | "decouplingFlg"
  | "clientPaid"
  | "driverReceived"
  | "decoupling"
  | "statusRaw"
  | "successOrderFlag"
  | "userStatus"
  | "driverStatus"
>;

type ClientMonthlyMetricRow = {
  monthKey: string;
  monthLabel: string;
  corpClientId: string;
  clientName: string;
  trips: number;
  totalDecoupling: number;
  decouplingPercent: number;
  totalSpendings: number;
  avgCheck: number;
  grossProfit: number;
};

type MonthlyTrendPoint = {
  monthKey: string;
  monthLabel: string;
  totalDecoupling: number;
  decouplingPercent: number;
  totalSpendings: number;
  avgCheck: number;
  grossProfit: number;
};

type YangoTrendMetricKey =
  | "totalDecoupling"
  | "decouplingPercent"
  | "totalSpendings"
  | "avgCheck"
  | "grossProfit";

type YangoTableSortKey =
  | "month_desc"
  | "month_asc"
  | "decoupling_desc"
  | "decoupling_pct_desc"
  | "spendings_desc"
  | "avg_check_desc"
  | "gross_profit_desc";

type OpsMetricKey =
  | "requests"
  | "trips"
  | "acceptanceRate"
  | "completedToRequest"
  | "riderCancelsPct"
  | "driverCancelsPct";

type OpsPoint = {
  date: string;
  label: string;
  requests: number;
  trips: number;
  acceptanceRate: number;
  completedToRequest: number;
  riderCancelsPct: number;
  driverCancelsPct: number;
};

type YangoGranularity = "day" | "week" | "month";
type YangoCompareWindow = "day" | "week" | "month";
type YangoClientSortKey =
  | "clientId"
  | "requests"
  | "trips"
  | "spend"
  | "decoupling"
  | "rate"
  | "lastTripDate"
  | "accountManager"
  | "salesManager";

const YANGO_NUMERIC_CARD_CLASS =
  "rounded-[24px] border border-white/70 bg-white/75 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-md transition-all duration-300 crm-hover-lift min-h-[160px]";
const BI_PANEL_CLASS =
  "rounded-[24px] border border-white/70 bg-white/75 p-4 shadow-[0_14px_30px_rgba(15,23,42,0.08)] backdrop-blur-md transition-all duration-300 crm-hover-lift";

const CLIENT_SPEND_COLORS = [
  "#16a34a",
  "#2563eb",
  "#d946ef",
  "#f97316",
  "#14b8a6",
  "#ef4444",
];

const OPS_METRICS: Record<
  OpsMetricKey,
  { label: string; color: string; isPercent: boolean; description: string }
> = {
  requests: {
    label: "Requests",
    color: "#2563eb",
    isPercent: false,
    description: "Number of B2B corp orders",
  },
  trips: {
    label: "Trips",
    color: "#16a34a",
    isPercent: false,
    description: "Successful trips",
  },
  acceptanceRate: {
    label: "Acceptance Rate",
    color: "#7c3aed",
    isPercent: true,
    description: "Requests accepted by drivers",
  },
  completedToRequest: {
    label: "Completed / Request",
    color: "#f59e0b",
    isPercent: true,
    description: "Share of requests completed as trips",
  },
  riderCancelsPct: {
    label: "Rider Cancels %",
    color: "#ef4444",
    isPercent: true,
    description: "User cancellations share",
  },
  driverCancelsPct: {
    label: "Driver Cancels %",
    color: "#0ea5e9",
    isPercent: true,
    description: "Driver cancellations share",
  },
};

const YANGO_BI_CONTRACT: Array<{ metric: string; formula: string }> = [
  { metric: "Scope", formula: "Only B2B corp orders: corp_client_id IS NOT NULL" },
  { metric: "Grain", formula: "Operational charts by day (each point = one date)" },
  { metric: "Requests", formula: "COUNT(order_id)" },
  { metric: "Trips", formula: "COUNT(order_id WHERE success_order_flg = true)" },
  {
    metric: "Acceptance Rate",
    formula: "(Requests - DriverCancels) / Requests * 100",
  },
  { metric: "Completed To Request", formula: "Trips / Requests * 100" },
  { metric: "Rider cancels, %", formula: "UserCancels / Requests * 100" },
  { metric: "Driver cancels, %", formula: "DriverCancels / Requests * 100" },
  {
    metric: "Decoupling (order)",
    formula: "user_w_vat_cost - driver_cost * 1.18",
  },
  {
    metric: "Decoupling %",
    formula: "SUM(decoupling) / SUM(user_w_vat_cost) * 100",
  },
  { metric: "Total spendings", formula: "SUM(user_w_vat_cost)" },
  { metric: "Average check", formula: "AVG(user_w_vat_cost)" },
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

function formatMonthLabel(value: string) {
  const date = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
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

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function getNiceAxisMax(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const normalized = value / magnitude;
  const step =
    normalized <= 1
      ? 1
      : normalized <= 2
        ? 2
        : normalized <= 5
          ? 5
          : 10;
  return step * magnitude;
}

type ChartGeometry = {
  svgWidth: number;
  svgHeight: number;
  plotLeft: number;
  plotRight: number;
  plotTop: number;
  plotBottom: number;
  plotHeight: number;
  xForIndex: (index: number, total: number) => number;
  yForValue: (value: number) => number;
  yTicks: number[];
};

function createChartGeometry({
  axisMax,
  svgWidth = 100,
  svgHeight = 18,
  plotLeft = 2,
  plotRight = 98,
  plotTop = 1.5,
  plotBottom = 14.5,
  yTickCount = 5,
}: {
  axisMax: number;
  svgWidth?: number;
  svgHeight?: number;
  plotLeft?: number;
  plotRight?: number;
  plotTop?: number;
  plotBottom?: number;
  yTickCount?: number;
}): ChartGeometry {
  const safeAxisMax = Math.max(1, axisMax);
  const safeTickCount = Math.max(2, yTickCount);
  const plotHeight = plotBottom - plotTop;
  const yTicks = Array.from(
    { length: safeTickCount },
    (_, index) => safeAxisMax - (safeAxisMax / (safeTickCount - 1)) * index,
  );
  const xForIndex = (index: number, total: number) =>
    total > 1 ? plotLeft + (index / (total - 1)) * (plotRight - plotLeft) : (plotLeft + plotRight) / 2;
  const yForValue = (value: number) =>
    plotBottom - (Math.max(0, Math.min(safeAxisMax, value)) / safeAxisMax) * plotHeight;

  return {
    svgWidth,
    svgHeight,
    plotLeft,
    plotRight,
    plotTop,
    plotBottom,
    plotHeight,
    xForIndex,
    yForValue,
    yTicks,
  };
}

function startOfWeek(date: Date) {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getBucketStart(date: Date, granularity: YangoGranularity) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  if (granularity === "week") return startOfWeek(next);
  if (granularity === "month") return new Date(next.getFullYear(), next.getMonth(), 1);
  return next;
}

function getBucketKey(date: Date, granularity: YangoGranularity) {
  const bucket = getBucketStart(date, granularity);
  const year = bucket.getFullYear();
  const month = String(bucket.getMonth() + 1).padStart(2, "0");
  const day = String(bucket.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getScheduledDateKey(value: string) {
  const isoDateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDateMatch) {
    return `${isoDateMatch[1]}-${isoDateMatch[2]}-${isoDateMatch[3]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeCorpClientId(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function buildYangoClientTripsHref({
  corpClientId,
  clientName,
  from,
  to,
}: {
  corpClientId: string;
  clientName: string;
  from: string;
  to: string;
}) {
  return buildSalesOperationB2BClientTripsHref({
    corpClientId,
    clientName,
    from,
    to,
  });
}

function dateKeyToDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function shiftDate(date: Date, compare: YangoCompareWindow, direction: -1 | 1) {
  const next = new Date(date);
  if (compare === "day") next.setDate(next.getDate() + direction);
  if (compare === "week") next.setDate(next.getDate() + 7 * direction);
  if (compare === "month") next.setMonth(next.getMonth() + direction);
  return next;
}

function formatShortDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

function buildOpsMetricsPoint({
  date,
  requests,
  trips,
  userCancels,
  driverCancels,
  label,
}: {
  date: string;
  requests: number;
  trips: number;
  userCancels: number;
  driverCancels: number;
  label: string;
}): OpsPoint {
  const safeRequests = Math.max(0, requests);
  const safeTrips = Math.max(0, trips);
  const safeUserCancels = Math.max(0, userCancels);
  const safeDriverCancels = Math.max(0, driverCancels);
  return {
    date,
    label,
    requests: safeRequests,
    trips: safeTrips,
    acceptanceRate:
      safeRequests > 0 ? ((safeRequests - safeDriverCancels) / safeRequests) * 100 : 0,
    completedToRequest: safeRequests > 0 ? (safeTrips / safeRequests) * 100 : 0,
    riderCancelsPct: safeRequests > 0 ? (safeUserCancels / safeRequests) * 100 : 0,
    driverCancelsPct: safeRequests > 0 ? (safeDriverCancels / safeRequests) * 100 : 0,
  };
}

function formatDateTimeCell(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function EmptyChartState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-slate-50 text-center">
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-muted">{subtitle}</p>
    </div>
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
  const axisMax = getNiceAxisMax(maxClientSpend);
  const geometry = createChartGeometry({ axisMax, svgHeight: 20, plotTop: 1.8, plotBottom: 16.8 });
  const { xForIndex, yForValue, yTicks } = geometry;
  const xPositions = series.map((_, index) => xForIndex(index, series.length));
  const pointsCount = series.length;
  const lineStrokeWidth = pointsCount > 60 ? 1 : pointsCount > 31 ? 1.2 : 1.6;
  const pointRadius = pointsCount > 60 ? 0.7 : pointsCount > 31 ? 1 : 1.8;
  const hitRadius = pointsCount > 60 ? 2 : pointsCount > 31 ? 2.8 : 4;

  return (
    <article className="relative overflow-hidden rounded-[28px] border border-border bg-white/90 p-5 shadow-sm crm-hover-lift">
      <div className="mb-2 flex items-center justify-between">
        <p className="crm-section-title text-2xl">Client spend</p>
        <p className="crm-subtitle font-semibold">Report</p>
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
        <div className="relative h-52">
          <svg viewBox={`0 0 ${geometry.svgWidth} ${geometry.svgHeight}`} className="relative h-44 w-full">
            {yTicks.map((tick, index) => (
              <line
                key={`client-grid-${tick}-${index}`}
                x1={geometry.plotLeft}
                x2={geometry.plotRight}
                y1={yForValue(tick)}
                y2={yForValue(tick)}
                stroke="#e2e8f0"
                strokeWidth="0.25"
              />
            ))}
            {yTicks.map((tick, index) => (
              <text
                key={`client-y-label-${tick}-${index}`}
                x={99.6}
                y={yForValue(tick) + 0.45}
                textAnchor="end"
                fontSize="1.6"
                fill="#64748b"
              >
                {formatCompactMoney(tick)}
              </text>
            ))}
            {hoveredSpend !== null ? (
              <line
                x1={xForIndex(hoveredSpend.pointIndex, series.length)}
                x2={xForIndex(hoveredSpend.pointIndex, series.length)}
                y1={geometry.plotTop}
                y2={geometry.plotBottom}
                stroke="#94a3b8"
                strokeWidth="0.35"
              />
            ) : null}

            {clientSeries.map((client, clientIndex) => (
              <g key={client.clientName}>
                <polyline
                  fill="none"
                  stroke={client.color}
                  strokeWidth={lineStrokeWidth}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={client.values
                    .map((value, index, array) => {
                      const x = xForIndex(index, array.length);
                      const y = yForValue(value);
                      return `${x},${y}`;
                    })
                    .join(" ")}
                />
                {client.values.map((value, pointIndex, array) => {
                  const x = xForIndex(pointIndex, array.length);
                  const y = yForValue(value);
                  return (
                    <g key={`${client.clientName}-${series[pointIndex]?.date ?? pointIndex}`}>
                      <circle cx={x} cy={y} r={pointRadius} fill={client.color} stroke="#ffffff" strokeWidth="0.2" />
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

          <div className="relative mt-2 h-4 text-[10px] text-muted">
            {series.map((item, index) =>
              index % axisStep === 0 || index === series.length - 1 ? (
                <span
                  key={item.date}
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${xPositions[index]}%` }}
                >
                  {formatAxisDate(item.date)}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      {hoveredSpendPoint ? (
        <div
          className="pointer-events-none absolute top-24 z-10 w-72 rounded-2xl border border-border bg-white/95 p-3 shadow-xl backdrop-blur-sm"
          style={{
            left: `calc(${Math.max(
              10,
              Math.min(82, xForIndex(hoveredSpend?.pointIndex ?? 0, series.length)),
            )}% - 144px)`,
          }}
        >
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

function YangoTopClientsCard({
  clients,
}: {
  clients: Array<{ name: string; trips: number; spent: number }>;
}) {
  const maxTrips = Math.max(1, ...clients.map((item) => item.trips));

  return (
    <article className="relative overflow-hidden rounded-[28px] border border-border bg-white/90 p-5 shadow-sm crm-hover-lift">
      <p className="crm-section-title text-xl">Top clients</p>
      <p className="crm-subtitle">By trips in selected date range</p>
      <div className="mt-4 space-y-2">
        {clients.slice(0, 5).map((item) => (
          <div key={item.name} className="rounded-xl border border-border/70 bg-white px-3 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-900">{item.name}</span>
              <span className="text-slate-700">{item.trips} trips</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{ width: `${Math.max((item.trips / maxTrips) * 100, item.trips > 0 ? 8 : 0)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted">{formatMoney(item.spent)}</p>
          </div>
        ))}
      </div>
    </article>
  );
}

function YangoMonthlyMetricsTable({ rows }: { rows: ClientMonthlyMetricRow[] }) {
  return (
    <article className={BI_PANEL_CLASS}>
      <div className="mb-3">
        <p className="crm-section-title">B2B Client-Month Metrics</p>
        <p className="crm-subtitle">Grouped by month and corp client with finance breakdown</p>
      </div>
      <div className="max-h-[460px] overflow-auto rounded-2xl border border-border/70">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-[#f6f6f8] text-slate-600 shadow-[0_1px_0_0_rgba(148,163,184,0.25)]">
            <tr>
              <th className="px-2 py-2 text-left">Month</th>
              <th className="px-2 py-2 text-left">Client</th>
              <th className="px-2 py-2 text-right">Decoupling sum</th>
              <th className="px-2 py-2 text-right">Decoupling %</th>
              <th className="px-2 py-2 text-right">Total spendings</th>
              <th className="px-2 py-2 text-right">Avg check</th>
              <th className="px-2 py-2 text-right">Gross profit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70 bg-white/70">
            {rows.map((row, index) => (
              <tr
                key={`${row.monthKey}:${row.corpClientId}`}
                className={`${index % 2 === 0 ? "bg-white/70" : "bg-slate-50/50"} hover:bg-white`}
              >
                <td className="px-2 py-1.5 text-slate-700">{row.monthLabel}</td>
                <td className="px-2 py-1.5 text-slate-700">
                  {row.clientName} ({row.corpClientId})
                </td>
                <td className="px-2 py-1.5 text-right text-slate-900">{formatMoney(row.totalDecoupling)}</td>
                <td className="px-2 py-1.5 text-right text-slate-900">
                  {row.decouplingPercent.toFixed(1)}%
                </td>
                <td className="px-2 py-1.5 text-right text-slate-900">{formatMoney(row.totalSpendings)}</td>
                <td className="px-2 py-1.5 text-right text-slate-900">{formatMoney(row.avgCheck)}</td>
                <td className="px-2 py-1.5 text-right text-slate-900">{formatMoney(row.grossProfit)}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-muted">
                  No rows for current filters. Try another month or clear client search.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </article>
  );
}

const YANGO_TREND_METRICS: Record<
  YangoTrendMetricKey,
  { label: string; color: string; formatter: (value: number) => string; subtitle: string }
> = {
  totalDecoupling: {
    label: "Decoupling sum",
    color: "#e11d48",
    formatter: (value) => formatMoney(value),
    subtitle: "SUM(user_w_vat_cost - driver_cost*1.18)",
  },
  decouplingPercent: {
    label: "Decoupling %",
    color: "#f97316",
    formatter: (value) => `${value.toFixed(1)}%`,
    subtitle: "(SUM(decoupling) / SUM(user_w_vat_cost)) * 100",
  },
  totalSpendings: {
    label: "Total spendings",
    color: "#2563eb",
    formatter: (value) => formatMoney(value),
    subtitle: "SUM(user_w_vat_cost)",
  },
  avgCheck: {
    label: "Average check",
    color: "#16a34a",
    formatter: (value) => formatMoney(value),
    subtitle: "AVG(user_w_vat_cost)",
  },
  grossProfit: {
    label: "Gross profit",
    color: "#7c3aed",
    formatter: (value) => formatMoney(value),
    subtitle: "order_cost - driver_cost*1.18",
  },
};

function YangoInteractiveTrend({
  points,
  metricKey,
  onMetricChange,
}: {
  points: MonthlyTrendPoint[];
  metricKey: YangoTrendMetricKey;
  onMetricChange: (metric: YangoTrendMetricKey) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const cfg = YANGO_TREND_METRICS[metricKey];
  const values = points.map((point) => point[metricKey]);
  const axisStep = Math.max(1, Math.ceil(points.length / 10));
  const maxValue = Math.max(1, ...values);
  const axisMax = getNiceAxisMax(maxValue);
  const latest = values[values.length - 1] ?? 0;
  const geometry = createChartGeometry({
    axisMax,
    svgHeight: 18,
    plotTop: 1.5,
    plotBottom: 14.5,
    plotLeft: 0,
    plotRight: 100,
  });
  const { xForIndex, yForValue, yTicks } = geometry;
  const xPositions = points.map((_, index) => xForIndex(index, points.length));
  const hoveredValue = hoveredIndex !== null ? (points[hoveredIndex]?.[metricKey] ?? 0) : 0;
  const hoveredPrevious =
    hoveredIndex !== null
      ? hoveredIndex > 0
        ? (points[hoveredIndex - 1]?.[metricKey] ?? 0)
        : (points[hoveredIndex]?.[metricKey] ?? 0)
      : 0;
  const buildPolyline = () =>
    points
      .map((point, index, array) => `${xForIndex(index, array.length)},${yForValue(point[metricKey] as number)}`)
      .join(" ");

  return (
    <article className={BI_PANEL_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="crm-section-title">{cfg.label} trend</p>
          <p className="crm-subtitle">{cfg.subtitle}</p>
        </div>
        <p className="text-xl font-semibold text-slate-900">{cfg.formatter(latest)}</p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(Object.keys(YANGO_TREND_METRICS) as YangoTrendMetricKey[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onMetricChange(key)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              metricKey === key
                ? "border-red-400 bg-red-50 text-red-700"
                : "border-border bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {YANGO_TREND_METRICS[key].label}
          </button>
        ))}
      </div>

      {points.length === 0 ? (
        <div className="mt-3">
          <EmptyChartState
            title="No trend data"
            subtitle="Current filter combination does not return rows for this metric."
          />
        </div>
      ) : (
        <div className="mt-3 rounded-xl border border-border/70 bg-slate-50 p-3">
          <div className="relative h-44">
            <svg viewBox={`0 0 ${geometry.svgWidth} ${geometry.svgHeight}`} className="relative h-40 w-full">
              {yTicks.map((tick, index) => (
                <line
                  key={`trend-grid-${tick}-${index}`}
                  x1={geometry.plotLeft}
                  x2={geometry.plotRight}
                  y1={yForValue(tick)}
                  y2={yForValue(tick)}
                  stroke="#e2e8f0"
                  strokeWidth="0.25"
                />
              ))}
              {yTicks.map((tick, index) => (
                <text
                  key={`trend-y-label-${tick}-${index}`}
                  x={99.6}
                  y={yForValue(tick) + 0.45}
                  textAnchor="end"
                  fontSize="1.6"
                  fill="#64748b"
                >
                  {cfg.formatter(tick)}
                </text>
              ))}
              {points.map((_, index) =>
                index % axisStep === 0 || index === points.length - 1 ? (
                  <line
                    key={`trend-x-grid-${index}`}
                    x1={xForIndex(index, points.length)}
                    x2={xForIndex(index, points.length)}
                    y1={geometry.plotTop}
                    y2={geometry.plotBottom}
                    stroke="#f1f5f9"
                    strokeWidth="0.25"
                  />
                ) : null,
              )}
              <polyline
                fill="none"
                stroke={cfg.color}
                strokeWidth="0.8"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={buildPolyline()}
              />
              {points.map((_, index, array) => {
                const center = xForIndex(index, array.length);
                const start =
                  index === 0 ? geometry.plotLeft : (xForIndex(index - 1, array.length) + center) / 2;
                const end =
                  index === array.length - 1
                    ? geometry.plotRight
                    : (center + xForIndex(index + 1, array.length)) / 2;
                return (
                  <rect
                    key={`trend-hover-band-${index}`}
                    x={start}
                    y={geometry.plotTop}
                    width={Math.max(0.8, end - start)}
                    height={geometry.plotBottom - geometry.plotTop}
                    fill="transparent"
                    onMouseEnter={() => setHoveredIndex(index)}
                    onMouseLeave={() => setHoveredIndex(null)}
                  />
                );
              })}
              {hoveredIndex !== null ? (
                <line
                  x1={xForIndex(hoveredIndex, points.length)}
                  x2={xForIndex(hoveredIndex, points.length)}
                  y1={geometry.plotTop}
                  y2={geometry.plotBottom}
                  stroke="#94a3b8"
                  strokeWidth="0.35"
                />
              ) : null}
              {points.map((point, index, array) => {
                const x = xForIndex(index, array.length);
                const y = yForValue(point[metricKey] as number);
                return (
                  <g key={`${point.monthKey}-${metricKey}`}>
                    <circle
                      cx={x}
                      cy={y}
                      r={hoveredIndex === index ? 1.4 : 1}
                      fill={cfg.color}
                      stroke="#ffffff"
                      strokeWidth="0.25"
                    />
                    <circle
                      cx={x}
                      cy={y}
                      r={2.6}
                      fill="transparent"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  </g>
                );
              })}
            </svg>
            <div className="relative mt-1 h-4 text-[10px] text-muted">
              {points.map((point, index) =>
                index % axisStep === 0 || index === points.length - 1 ? (
                  <span
                    key={point.monthKey}
                    className="absolute -translate-x-1/2 whitespace-nowrap"
                    style={{ left: `${xPositions[index]}%` }}
                  >
                    {point.monthLabel}
                  </span>
                ) : null,
              )}
            </div>
            {hoveredIndex !== null ? (
              <div
                className="pointer-events-none absolute top-2 z-10 min-w-[210px] rounded-lg border border-border bg-white/95 p-2 text-xs shadow-sm"
                style={{
                  left: `calc(${Math.max(8, Math.min(88, xForIndex(hoveredIndex, points.length)))}% - 105px)`,
                }}
              >
                <p className="font-semibold text-slate-900">{points[hoveredIndex]?.monthLabel}</p>
                <p className="text-slate-700">{cfg.label}: {cfg.formatter(hoveredValue)}</p>
                <p className="text-slate-500">
                  vs prev: {cfg.formatter(hoveredPrevious)} ({formatDeltaPercent(hoveredValue, hoveredPrevious)})
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </article>
  );
}

function B2BOpsTrendChart({
  title,
  subtitle,
  points,
  comparePoints,
  series,
}: {
  title: string;
  subtitle: string;
  points: OpsPoint[];
  comparePoints: OpsPoint[];
  series: OpsMetricKey[];
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const values = points.flatMap((item) => series.map((key) => item[key] as number));
  const compareValues = comparePoints.flatMap((item) => series.map((key) => item[key] as number));
  const maxValue = Math.max(1, ...values, ...compareValues);
  const axisMax = getNiceAxisMax(maxValue);
  const axisStep = Math.max(1, Math.ceil(points.length / 7));
  const geometry = createChartGeometry({ axisMax, svgHeight: 18, plotTop: 1.5, plotBottom: 14.5 });
  const { xForIndex, yForValue, yTicks } = geometry;
  const xPositions = points.map((_, index) => xForIndex(index, points.length));
  const primarySeriesKey = series[0];
  const buildCurrentPolyline = (metric: OpsMetricKey) =>
    points
      .map((point, index, array) => `${xForIndex(index, array.length)},${yForValue(point[metric] as number)}`)
      .join(" ");
  const buildComparePolyline = (metric: OpsMetricKey) =>
    points
      .map((_, index, array) => {
        const comparePoint = comparePoints[index];
        const value = (comparePoint?.[metric] as number | undefined) ?? 0;
        return `${xForIndex(index, array.length)},${yForValue(value)}`;
      })
      .join(" ");
  const buildAreaPath = (metric: OpsMetricKey) => {
    if (points.length === 0) return "";
    const line = points
      .map(
        (point, index, array) =>
          `${index === 0 ? "M" : "L"} ${xForIndex(index, array.length)} ${yForValue(point[metric] as number)}`,
      )
      .join(" ");
    const lastX = xForIndex(points.length - 1, points.length);
    const firstX = xForIndex(0, points.length);
    return `${line} L ${lastX} ${geometry.plotBottom} L ${firstX} ${geometry.plotBottom} Z`;
  };
  const hoverCurrent = hoveredIndex !== null ? points[hoveredIndex] : null;
  const hoverCompare = hoveredIndex !== null ? comparePoints[hoveredIndex] : null;
  const formatMetric = (metric: OpsMetricKey, value: number) =>
    OPS_METRICS[metric].isPercent ? formatPercent(value) : Math.round(value).toLocaleString("en-US");

  return (
    <article className={BI_PANEL_CLASS}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="crm-section-title">{title}</p>
          <p className="crm-subtitle">{subtitle}</p>
        </div>
        <p className="text-sm text-muted">Solid = current period, dashed = previous period</p>
      </div>

      {points.length === 0 ? (
        <EmptyChartState
          title="No data for chart"
          subtitle="Adjust Yango dates to a period where B2B corp orders exist."
        />
      ) : (
        <div className="rounded-xl border border-border/70 bg-slate-50 p-3">
          <div className="mb-2 flex flex-wrap gap-2 text-[11px] text-slate-600">
            {series.map((key) => (
              <span
                key={key}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5"
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: OPS_METRICS[key].color }} />
                {OPS_METRICS[key].label}
              </span>
            ))}
          </div>
          <div className="grid h-44 grid-cols-[minmax(0,1fr)_2.25rem] gap-0">
            <div className="relative">
              <svg
                viewBox={`0 0 ${geometry.svgWidth} ${geometry.svgHeight}`}
                preserveAspectRatio="none"
                className="relative h-40 w-full"
              >
                {yTicks.map((tick) => (
                  <line
                    key={`grid-${tick}`}
                    x1={geometry.plotLeft}
                    x2={geometry.plotRight}
                    y1={yForValue(tick)}
                    y2={yForValue(tick)}
                    stroke="#e2e8f0"
                    strokeWidth="0.25"
                  />
                ))}
                {points.map((_, index) =>
                  index % axisStep === 0 || index === points.length - 1 ? (
                    <line
                      key={`x-grid-${index}`}
                      x1={xForIndex(index, points.length)}
                      x2={xForIndex(index, points.length)}
                      y1={geometry.plotTop}
                      y2={geometry.plotBottom}
                      stroke="#f1f5f9"
                      strokeWidth="0.25"
                    />
                  ) : null,
                )}
                {series.map((key) => (
                  <path
                    key={`area-${key}`}
                    d={buildAreaPath(key)}
                    fill={OPS_METRICS[key].color}
                    opacity="0.08"
                  />
                ))}
                {series.map((key) => (
                  <polyline
                    key={`current-${key}`}
                    fill="none"
                    stroke={OPS_METRICS[key].color}
                    strokeWidth="0.8"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    points={buildCurrentPolyline(key)}
                  />
                ))}
                {series.map((key) => (
                  <polyline
                    key={`compare-${key}`}
                    fill="none"
                    stroke={OPS_METRICS[key].color}
                    strokeWidth="0.75"
                    strokeDasharray="1.8 1.4"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity="0.65"
                    points={buildComparePolyline(key)}
                  />
                ))}
                {points.map((_, index, array) => {
                  const center = xForIndex(index, array.length);
                  const start =
                    index === 0 ? geometry.plotLeft : (xForIndex(index - 1, array.length) + center) / 2;
                  const end =
                    index === array.length - 1
                      ? geometry.plotRight
                      : (center + xForIndex(index + 1, array.length)) / 2;
                  return (
                    <rect
                      key={`hover-band-${index}`}
                      x={start}
                      y={geometry.plotTop}
                      width={Math.max(0.8, end - start)}
                      height={geometry.plotBottom - geometry.plotTop}
                      fill="transparent"
                      onMouseEnter={() => setHoveredIndex(index)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  );
                })}
                {points.map((point, index, array) => {
                  const x = xForIndex(index, array.length);
                  const y = yForValue(point[primarySeriesKey] as number);
                  return (
                    <g key={`${point.date}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={hoveredIndex === index ? 1.4 : 1}
                        fill={OPS_METRICS[primarySeriesKey].color}
                        stroke="#ffffff"
                        strokeWidth="0.25"
                      />
                      <circle
                        cx={x}
                        cy={y}
                        r={2.8}
                        fill="transparent"
                        onMouseEnter={() => setHoveredIndex(index)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      />
                      <circle
                        cx={x}
                        cy={yForValue((comparePoints[index]?.[primarySeriesKey] as number | undefined) ?? 0)}
                        r={0.75}
                        fill="#ffffff"
                        stroke={OPS_METRICS[primarySeriesKey].color}
                        strokeWidth="0.25"
                        opacity="0.75"
                      />
                    </g>
                  );
                })}
                {hoveredIndex !== null ? (
                  <line
                    x1={xForIndex(hoveredIndex, points.length)}
                    x2={xForIndex(hoveredIndex, points.length)}
                    y1={geometry.plotTop}
                    y2={geometry.plotBottom}
                    stroke="#94a3b8"
                    strokeWidth="0.35"
                  />
                ) : null}
              </svg>
              {hoveredIndex !== null && hoverCurrent ? (
                <div
                  className="pointer-events-none absolute top-2 z-10 min-w-[190px] rounded-lg border border-border bg-white/95 p-2 text-xs shadow-sm"
                  style={{ left: `calc(${Math.max(8, Math.min(88, xForIndex(hoveredIndex, points.length)))}% - 90px)` }}
                >
                  <p className="font-semibold text-slate-900">{hoverCurrent.label}</p>
                  {series.map((key) => {
                    const current = hoverCurrent[key] as number;
                    const previous = (hoverCompare?.[key] as number | undefined) ?? 0;
                    const delta = current - previous;
                    return (
                      <p key={key} className="text-slate-700">
                        {OPS_METRICS[key].label}: {formatMetric(key, current)}{" "}
                        <span className="text-slate-500">vs {formatMetric(key, previous)}</span>{" "}
                        <span className={delta >= 0 ? "text-emerald-700" : "text-rose-700"}>
                          ({delta >= 0 ? "+" : ""}
                          {formatMetric(key, delta)})
                        </span>
                      </p>
                    );
                  })}
                </div>
              ) : null}
              <div className="relative mt-1 h-4 text-[10px] text-muted">
                {points.map((point, index) =>
                  index % axisStep === 0 || index === points.length - 1 ? (
                    <span
                      key={point.date}
                      className="absolute -translate-x-1/2 whitespace-nowrap"
                      style={{ left: `${xPositions[index]}%` }}
                    >
                      {formatShortDate(point.date)}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
            <div className="flex h-40 flex-col justify-between pt-[2px] text-right text-[10px] text-muted">
              {yTicks.map((tick, index) => (
                <span key={`y-axis-${tick}-${index}`} className="leading-none">
                  {Math.round(tick)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function isSchedulingOrderRow(row: B2BDashboardOrder): boolean {
  return (row.statusRaw ?? "").toLowerCase().includes("scheduling");
}

/** Local calendar YYYY-MM-DD for list / filter alignment (avoids UTC-only ISO edge cases). */
function localYmdFromIso(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Orders view: show row if **scheduled** or **created** day falls in [fromDate, toDate] (inclusive). */
function orderRowMatchesOrdersDateFilter(
  row: B2BDashboardOrder,
  fromDate: string | null,
  toDate: string | null,
): boolean {
  const keys = new Set<string>();
  const sched = localYmdFromIso(row.scheduledAt);
  if (sched) keys.add(sched);
  if (row.createdAt && row.createdAt !== "Not provided by API") {
    const created = localYmdFromIso(row.createdAt);
    if (created) keys.add(created);
  }
  if (keys.size === 0) return false;
  for (const k of keys) {
    if (fromDate && k < fromDate) continue;
    if (toDate && k > toDate) continue;
    return true;
  }
  return false;
}

function resolveDashboardStatus(row: B2BDashboardOrder): Exclude<StatusFilter, "all"> {
  const rawStatus = (row.statusRaw ?? "").toLowerCase();
  if (
    rawStatus === "complete" ||
    rawStatus === "completed" ||
    rawStatus === "finished" ||
    rawStatus === "transporting_finished"
  ) {
    return "completed";
  }
  if (rawStatus.includes("cancel")) return "cancelled";
  if (
    rawStatus.includes("search") ||
    rawStatus.includes("driving") ||
    rawStatus.includes("transporting") ||
    rawStatus.includes("arrived") ||
    rawStatus.includes("accepted") ||
    rawStatus.includes("in_progress")
  ) {
    return "in_progress";
  }

  const scheduledTs = new Date(row.scheduledAt).getTime();
  if (!Number.isNaN(scheduledTs) && scheduledTs > Date.now()) {
    return "pending";
  }

  return "pending";
}

function getOrderStatusDisplay(row: B2BDashboardOrder): {
  label: string;
  tone: "completed" | "cancelled" | "in_progress" | "neutral";
} {
  const normalized = resolveDashboardStatus(row);
  if (normalized === "completed") {
    return { label: "Completed", tone: "completed" };
  }
  if (normalized === "cancelled") {
    return { label: "Canceled", tone: "cancelled" };
  }
  if (normalized === "in_progress") {
    return { label: "In Progress", tone: "in_progress" };
  }
  const raw = row.statusRaw?.trim();
  return {
    label: raw && raw.length > 0 ? raw : "Unknown",
    tone: "neutral",
  };
}

export function B2BPreOrdersPanel({
  rows,
  yangoRows = [],
  view = "dashboard",
  corpClientNameMap = {},
  b2bClientRegistry = [],
  onB2BRegistryUpdated,
  ordersRemote,
}: B2BPreOrdersPanelProps) {
  const { canAccessDashboardBlock, currentUser, users } = useAuth();
  const router = useRouter();
  const gpUploadInputRef = useRef<HTMLInputElement>(null);
  const defaultFromDate = (() => {
    if (view === "orders" && ordersRemote) {
      return ordersRemote.range.fromDateStr;
    }
    const date = new Date();
    if (view === "dashboard") {
      return toDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
    }
    date.setDate(date.getDate() - 90);
    return toDateInputValue(date);
  })();
  const defaultToDate = (() => {
    if (view === "orders" && ordersRemote) {
      return ordersRemote.range.toDateStr;
    }
    const date = new Date();
    if (view === "dashboard") {
      return toDateInputValue(date);
    }
    date.setDate(date.getDate() + 90);
    return toDateInputValue(date);
  })();
  const [fromDate, setFromDate] = useState(() => {
    return defaultFromDate;
  });
  const [toDate, setToDate] = useState(() => {
    return defaultToDate;
  });
  const [yangoFromDate, setYangoFromDate] = useState(() => {
    const date = new Date();
    return toDateInputValue(new Date(date.getFullYear(), date.getMonth(), 1));
  });
  const [yangoToDate, setYangoToDate] = useState(() => {
    const date = new Date();
    return toDateInputValue(date);
  });
  const [yangoTrendMetric, setYangoTrendMetric] = useState<YangoTrendMetricKey>("totalDecoupling");
  const [yangoMonthFilter, setYangoMonthFilter] = useState("all");
  const [yangoClientFilter, setYangoClientFilter] = useState("all");
  const [yangoClientSearch, setYangoClientSearch] = useState("");
  const [yangoAccountManagerFilter, setYangoAccountManagerFilter] = useState("all");
  const [yangoSalesManagerFilter, setYangoSalesManagerFilter] = useState("all");
  const [selectedRegistryClientId, setSelectedRegistryClientId] = useState<string | null>(null);
  const [managerDraft, setManagerDraft] = useState({ accountManagerUserId: "", salesManagerUserId: "" });
  const [managerSaving, setManagerSaving] = useState(false);
  const [managerSaveError, setManagerSaveError] = useState<string | null>(null);
  const [yangoSelectedClients, setYangoSelectedClients] = useState<string[]>([]);
  const [yangoClientSortKey, setYangoClientSortKey] = useState<YangoClientSortKey>("decoupling");
  const [yangoClientSortDir, setYangoClientSortDir] = useState<"asc" | "desc">("desc");
  const [clientFilter, setClientFilter] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("date_desc");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [loadedOrders, setLoadedOrders] = useState<B2BDashboardOrder[]>(() => rows);
  const [listCursors, setListCursors] = useState<B2BOrdersListCursors>(
    () => ordersRemote?.initialCursors ?? {},
  );
  const [hasMoreRemote, setHasMoreRemote] = useState(() => ordersRemote?.initialHasMore ?? false);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);
  const isB2bClientsOverview = view === "b2bClientsOverview";
  const canSeeApiData = view !== "dashboard" || canAccessDashboardBlock("apiData");
  const canSeeYangoData =
    isB2bClientsOverview ||
    (view !== "dashboard" || canAccessDashboardBlock("yangoData"));
  const showApiDashboardSection = canSeeApiData && view === "dashboard";
  const showYangoClientsOverview = isB2bClientsOverview;
  const normalizedCorpClientNameMap = useMemo(
    () =>
      new Map<string, string>(
        Object.entries(corpClientNameMap)
          .map(
            ([key, value]) =>
              [normalizeCorpClientId(key), value?.trim() ?? ""] as [string, string],
          )
          .filter(([, value]) => value.length > 0),
      ),
    [corpClientNameMap],
  );

  const registryByCorpId = useMemo(
    () => new Map(b2bClientRegistry.map((entry) => [entry.corpClientId, entry])),
    [b2bClientRegistry],
  );

  const accountManagerOptions = useMemo(() => getAccountManagerUserOptions(users), [users]);
  const salesManagerOptions = useMemo(() => getSalesManagerUserOptions(users), [users]);


  const [selectedOrder, setSelectedOrder] = useState<B2BDashboardOrder | null>(null);
  const [orderDetails, setOrderDetails] = useState<B2BOrderDetailsResponse | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [cancelInYangoLoading, setCancelInYangoLoading] = useState(false);
  const [cancelInYangoError, setCancelInYangoError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [gpUploading, setGpUploading] = useState(false);
  const [gpUploadError, setGpUploadError] = useState<string | null>(null);
  const [gpUploadResult, setGpUploadResult] = useState<GpTripsImportResult | null>(null);
  const [gpUploadModalOpen, setGpUploadModalOpen] = useState(false);
  const [gpUploadRefreshOnClose, setGpUploadRefreshOnClose] = useState(false);

  const orderSourceRows = view === "orders" && ordersRemote ? loadedOrders : rows;

  const apiRowsForView = useMemo(() => {
    if (view !== "orders") return orderSourceRows;
    return orderSourceRows.filter((row) => !isSchedulingOrderRow(row));
  }, [orderSourceRows, view]);

  const clientOptions = useMemo(
    () => ["all", ...new Set(apiRowsForView.map((row) => row.clientName))],
    [apiRowsForView],
  );
  const isClientScopedUser = currentUser?.accountType === "client";
  const fixedClientName = useMemo(
    () => (isClientScopedUser ? apiRowsForView[0]?.clientName ?? null : null),
    [apiRowsForView, isClientScopedUser],
  );
  const effectiveClientFilter =
    isClientScopedUser && fixedClientName ? fixedClientName : clientFilter;

  const scopedRows = useMemo(() => {
    return apiRowsForView.filter((row) => {
      if (effectiveClientFilter !== "all" && row.clientName !== effectiveClientFilter) return false;
      if (statusFilter !== "all" && resolveDashboardStatus(row) !== statusFilter) return false;
      return true;
    });
  }, [apiRowsForView, effectiveClientFilter, statusFilter]);

  const filteredRows = useMemo(() => {
    const result = scopedRows.filter((row) => {
      if (view === "orders") {
        return orderRowMatchesOrdersDateFilter(row, fromDate || null, toDate || null);
      }
      const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
      const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
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
  }, [scopedRows, fromDate, toDate, sortMode, view]);
  const uiDatesToApiIso = useCallback((from: string, to: string) => {
    return {
      since: new Date(`${from}T00:00:00`).toISOString(),
      till: new Date(`${to}T23:59:59`).toISOString(),
    };
  }, []);

  const fetchOrdersRemoteBatch = useCallback(
    async (input: {
      since: string;
      till: string;
      cursors: B2BOrdersListCursors;
      excludeKeys: Set<string>;
      targetCount: number;
    }) => {
      const response = await fetch("/api/b2b-orders-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          since: input.since,
          till: input.till,
          cursors: input.cursors,
          excludeOrderKeys: [...input.excludeKeys],
          targetCount: input.targetCount,
          excludeScheduling: true,
        }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        rows?: B2BDashboardOrder[];
        nextCursors?: B2BOrdersListCursors;
        hasMore?: boolean;
        error?: string;
      };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to load orders.");
      }
      return {
        rows: data.rows ?? [],
        nextCursors: data.nextCursors ?? {},
        hasMore: Boolean(data.hasMore),
      };
    },
    [],
  );

  const handleLoadMoreOrders = useCallback(async () => {
    if (!ordersRemote || view !== "orders") return;
    const { since, till } = uiDatesToApiIso(fromDate, toDate);
    const excludeKeys = new Set(loadedOrders.map((row) => b2bDashboardOrderKey(row)));
    setRemoteLoading(true);
    setRemoteError(null);
    try {
      const result = await fetchOrdersRemoteBatch({
        since,
        till,
        cursors: listCursors,
        excludeKeys,
        targetCount: 20,
      });
      const merged = new Map<string, B2BDashboardOrder>();
      for (const row of loadedOrders) {
        merged.set(b2bDashboardOrderKey(row), row);
      }
      for (const row of result.rows) {
        merged.set(b2bDashboardOrderKey(row), row);
      }
      const next = [...merged.values()].sort(
        (a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      );
      setLoadedOrders(next);
      setListCursors(result.nextCursors);
      setHasMoreRemote(result.hasMore);
    } catch (error) {
      setRemoteError(error instanceof Error ? error.message : "Failed to load more orders.");
    } finally {
      setRemoteLoading(false);
    }
  }, [
    fetchOrdersRemoteBatch,
    fromDate,
    loadedOrders,
    listCursors,
    ordersRemote,
    toDate,
    uiDatesToApiIso,
    view,
  ]);

  const ordersSummary = useMemo(() => {
    const completed = filteredRows.filter((row) => resolveDashboardStatus(row) === "completed").length;
    const cancelled = filteredRows.filter((row) => resolveDashboardStatus(row) === "cancelled").length;
    const inProgressTotal = filteredRows.filter((row) => resolveDashboardStatus(row) === "in_progress").length;
    const todayKey = toDateInputValue(new Date());
    const inProgress = fromDate <= todayKey && toDate >= todayKey ? inProgressTotal : 0;
    return { completed, cancelled, inProgress };
  }, [filteredRows, fromDate, toDate]);

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

  const apiOpsData = useMemo(() => {
    const from = new Date(`${fromDate}T00:00:00`);
    const to = new Date(`${toDate}T23:59:59`);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to < from) {
      return {
        points: [] as OpsPoint[],
        comparePoints: [] as OpsPoint[],
      };
    }

    const byDate = new Map<
      string,
      { requests: number; trips: number; userCancels: number; driverCancels: number }
    >();

    for (const row of filteredRows) {
      const dateKey = getScheduledDateKey(row.scheduledAt);
      if (!dateKey) continue;
      const status = resolveDashboardStatus(row);
      const statusRaw = (row.statusRaw ?? "").toLowerCase();
      const bucket = byDate.get(dateKey) ?? {
        requests: 0,
        trips: 0,
        userCancels: 0,
        driverCancels: 0,
      };
      bucket.requests += 1;
      if (status === "completed") bucket.trips += 1;
      if (status === "cancelled" && statusRaw.includes("user")) bucket.userCancels += 1;
      if (status === "cancelled" && statusRaw.includes("driver")) bucket.driverCancels += 1;
      byDate.set(dateKey, bucket);
    }

    const points: OpsPoint[] = [];
    const comparePoints: OpsPoint[] = [];
    const durationMs = to.getTime() - from.getTime() + 1;
    const compareOffsetMs = Math.max(24 * 60 * 60 * 1000, durationMs);
    const dayMs = 24 * 60 * 60 * 1000;
    for (let ts = from.getTime(); ts <= to.getTime(); ts += dayMs) {
      const day = new Date(ts);
      const dateKey = toDateInputValue(day);
      const values = byDate.get(dateKey) ?? {
        requests: 0,
        trips: 0,
        userCancels: 0,
        driverCancels: 0,
      };
      points.push(
        buildOpsMetricsPoint({
          date: dateKey,
          label: formatShortDate(dateKey),
          ...values,
        }),
      );

      const compareDate = new Date(ts - compareOffsetMs);
      const compareDateKey = toDateInputValue(compareDate);
      const compareValues = byDate.get(compareDateKey) ?? {
        requests: 0,
        trips: 0,
        userCancels: 0,
        driverCancels: 0,
      };
      comparePoints.push(
        buildOpsMetricsPoint({
          date: compareDateKey,
          label: formatShortDate(compareDateKey),
          ...compareValues,
        }),
      );
    }

    return { points, comparePoints };
  }, [filteredRows, fromDate, toDate]);

  const apiTopClients = useMemo(() => {
    const perClient = new Map<string, { trips: number; spent: number }>();

    for (const row of filteredRows) {
      const client = perClient.get(row.clientName) ?? { trips: 0, spent: 0 };
      client.trips += 1;
      client.spent += row.clientPaid;
      perClient.set(row.clientName, client);
    }

    return [...perClient.entries()]
      .map(([name, value]) => ({ name, trips: value.trips, spent: value.spent }))
      .sort((a, b) => b.trips - a.trips);
  }, [filteredRows]);

  const normalizedYangoRows = useMemo(() => {
    const sourceRows: YangoMetricsRow[] = yangoRows.map((row) => ({
      ...row,
      clientName: row.clientName,
    }));
    const clientNameByCorpId = new Map<string, string>();
    for (const row of rows) {
      if (row.clientId) {
        clientNameByCorpId.set(normalizeCorpClientId(row.clientId), row.clientName);
      }
    }
    return sourceRows
      .map((row) => ({
        ...row,
        corpClientId: normalizeCorpClientId(row.corpClientId),
        clientName: (() => {
          const corpId = normalizeCorpClientId(row.corpClientId);
          if (!corpId) return row.clientName;
          const explicitMapName = normalizedCorpClientNameMap.get(corpId);
          if (explicitMapName && explicitMapName.trim()) {
            return explicitMapName;
          }
          const mappedName = clientNameByCorpId.get(corpId);
          if (!row.clientName || row.clientName === row.corpClientId) {
            return mappedName ?? corpId;
          }
          return row.clientName;
        })(),
      }))
      .filter((row) => {
        if (!row.corpClientId) return false;
        if (!getScheduledDateKey(row.scheduledAt)) return false;
        return true;
      });
  }, [yangoRows, rows, normalizedCorpClientNameMap]);

  const yangoClientOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const row of normalizedYangoRows) {
      const id = normalizeCorpClientId(row.corpClientId);
      if (!id) continue;
      const name = (row.clientName ?? "").trim();
      if (!byId.has(id)) {
        byId.set(id, name || id);
      } else if (!name || name === id) {
        // keep existing better human-readable value
      } else if (byId.get(id) === id) {
        byId.set(id, name);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [normalizedYangoRows]);

  const filteredYangoClientOptions = useMemo(() => {
    const query = yangoClientSearch.trim().toLowerCase();
    if (!query) return yangoClientOptions;
    return yangoClientOptions.filter((client) => {
      return (
        client.name.toLowerCase().includes(query) ||
        client.id.toLowerCase().includes(query)
      );
    });
  }, [yangoClientOptions, yangoClientSearch]);

  const selectedClientSet = useMemo(() => new Set(yangoSelectedClients), [yangoSelectedClients]);

  const activeYangoRows = useMemo(() => {
    if (!yangoFromDate || !yangoToDate || yangoToDate < yangoFromDate) return [];
    return normalizedYangoRows.filter((row) => {
      const rowDateKey = getScheduledDateKey(row.scheduledAt);
      if (!rowDateKey || rowDateKey < yangoFromDate || rowDateKey > yangoToDate) return false;
      if (
        selectedClientSet.size > 0 &&
        !selectedClientSet.has(normalizeCorpClientId(row.corpClientId))
      ) {
        return false;
      }
      return true;
    });
  }, [normalizedYangoRows, selectedClientSet, yangoFromDate, yangoToDate]);

  const decouplingData = useMemo(() => {
    const byClient = new Map<
      string,
      {
        clientId: string;
        clientName: string;
        requests: number;
        trips: number;
        spend: number;
        driversReceived: number;
        decoupling: number;
        lastTripDate: string | null;
        lastTripTs: number;
      }
    >();
    for (const row of activeYangoRows) {
      const clientId = normalizeCorpClientId(row.corpClientId) || "unknown";
      const scheduledTs = new Date(row.scheduledAt).getTime();
      const resolvedClientName =
        normalizedCorpClientNameMap.get(clientId) ||
        (row.clientName ?? "").trim() ||
        clientId;
      const client = byClient.get(clientId) ?? {
        clientId,
        clientName: resolvedClientName,
        requests: 0,
        trips: 0,
        spend: 0,
        driversReceived: 0,
        decoupling: 0,
        lastTripDate: null,
        lastTripTs: Number.NaN,
      };
      client.requests += 1;
      if (row.successOrderFlag === true) {
        client.trips += 1;
      }
      client.spend += row.clientPaid;
      client.driversReceived += row.driverReceived;
      client.decoupling += row.clientPaid - row.driverReceived;
      if (client.clientName === clientId && resolvedClientName !== clientId) {
        client.clientName = resolvedClientName;
      }
      if (!Number.isNaN(scheduledTs) && (Number.isNaN(client.lastTripTs) || scheduledTs > client.lastTripTs)) {
        client.lastTripTs = scheduledTs;
        client.lastTripDate = row.scheduledAt;
      }
      byClient.set(clientId, client);
    }

    const rows = [...byClient.values()].map((row) => {
      const registryEntry = registryByCorpId.get(row.clientId);
      return {
        ...row,
        rate: row.spend > 0 ? (row.decoupling / row.spend) * 100 : 0,
        accountManagerUserId: registryEntry?.accountManager.userId ?? null,
        accountManagerName: registryEntry?.accountManager.name ?? null,
        salesManagerUserId: registryEntry?.salesManager.userId ?? null,
        salesManagerName: registryEntry?.salesManager.name ?? null,
      };
    });

    const filteredRows = rows.filter((row) => {
      if (
        yangoAccountManagerFilter !== "all" &&
        (row.accountManagerUserId ?? "") !== yangoAccountManagerFilter
      ) {
        return false;
      }
      if (yangoSalesManagerFilter !== "all" && (row.salesManagerUserId ?? "") !== yangoSalesManagerFilter) {
        return false;
      }
      const query = yangoClientSearch.trim().toLowerCase();
      if (query) {
        const name = row.clientName.toLowerCase();
        const id = row.clientId.toLowerCase();
        if (!name.includes(query) && !id.includes(query)) return false;
      }
      return true;
    });

    filteredRows.sort((a, b) => {
      const factor = yangoClientSortDir === "asc" ? 1 : -1;
      if (yangoClientSortKey === "clientId") return factor * a.clientName.localeCompare(b.clientName);
      if (yangoClientSortKey === "requests") return factor * (a.requests - b.requests);
      if (yangoClientSortKey === "trips") return factor * (a.trips - b.trips);
      if (yangoClientSortKey === "spend") return factor * (a.spend - b.spend);
      if (yangoClientSortKey === "rate") return factor * (a.rate - b.rate);
      if (yangoClientSortKey === "accountManager") {
        return factor * (a.accountManagerName ?? "").localeCompare(b.accountManagerName ?? "");
      }
      if (yangoClientSortKey === "salesManager") {
        return factor * (a.salesManagerName ?? "").localeCompare(b.salesManagerName ?? "");
      }
      if (yangoClientSortKey === "lastTripDate") {
        const aTs = Number.isNaN(a.lastTripTs) ? Number.NEGATIVE_INFINITY : a.lastTripTs;
        const bTs = Number.isNaN(b.lastTripTs) ? Number.NEGATIVE_INFINITY : b.lastTripTs;
        return factor * (aTs - bTs);
      }
      return factor * (a.decoupling - b.decoupling);
    });

    const totalSpendVal = filteredRows.reduce((sum, row) => sum + row.spend, 0);
    const totalDriversVal = filteredRows.reduce((sum, row) => sum + row.driversReceived, 0);
    const totalDecouplingVal = filteredRows.reduce((sum, row) => sum + row.decoupling, 0);

    // Within-period daily series (drives the sparkline shape).
    const includedClientIds = new Set(filteredRows.map((row) => row.clientId));
    const dayMap = new Map<string, { spend: number; drivers: number; decoupling: number }>();
    for (const row of activeYangoRows) {
      const clientId = normalizeCorpClientId(row.corpClientId) || "unknown";
      if (!includedClientIds.has(clientId)) continue;
      const day = getScheduledDateKey(row.scheduledAt);
      if (!day) continue;
      const bucket = dayMap.get(day) ?? { spend: 0, drivers: 0, decoupling: 0 };
      bucket.spend += row.clientPaid;
      bucket.drivers += row.driverReceived;
      bucket.decoupling += row.clientPaid - row.driverReceived;
      dayMap.set(day, bucket);
    }
    const days = [...dayMap.keys()].sort();
    const spendSeries = days.map((day) => dayMap.get(day)!.spend);
    const driversSeries = days.map((day) => dayMap.get(day)!.drivers);
    const decouplingSeries = days.map((day) => dayMap.get(day)!.decoupling);

    // Real previous-period comparison: same length window, immediately preceding.
    const prevTotals = { spend: 0, drivers: 0, decoupling: 0 };
    let prevHasData = false;
    if (yangoFromDate && yangoToDate && yangoToDate >= yangoFromDate) {
      const dayMs = 86_400_000;
      const fromTs = new Date(`${yangoFromDate}T00:00:00Z`).getTime();
      const toTs = new Date(`${yangoToDate}T00:00:00Z`).getTime();
      if (Number.isFinite(fromTs) && Number.isFinite(toTs)) {
        const lengthDays = Math.round((toTs - fromTs) / dayMs) + 1;
        const prevToTs = fromTs - dayMs;
        const prevFromTs = prevToTs - (lengthDays - 1) * dayMs;
        const prevFromKey = new Date(prevFromTs).toISOString().slice(0, 10);
        const prevToKey = new Date(prevToTs).toISOString().slice(0, 10);
        for (const row of normalizedYangoRows) {
          const dateKey = getScheduledDateKey(row.scheduledAt);
          if (!dateKey || dateKey < prevFromKey || dateKey > prevToKey) continue;
          const clientId = normalizeCorpClientId(row.corpClientId) || "unknown";
          if (selectedClientSet.size > 0 && !selectedClientSet.has(clientId)) continue;
          const registryEntry = registryByCorpId.get(clientId);
          const amId = registryEntry?.accountManager.userId ?? null;
          const smId = registryEntry?.salesManager.userId ?? null;
          if (yangoAccountManagerFilter !== "all" && (amId ?? "") !== yangoAccountManagerFilter) {
            continue;
          }
          if (yangoSalesManagerFilter !== "all" && (smId ?? "") !== yangoSalesManagerFilter) {
            continue;
          }
          prevHasData = true;
          prevTotals.spend += row.clientPaid;
          prevTotals.drivers += row.driverReceived;
          prevTotals.decoupling += row.clientPaid - row.driverReceived;
        }
      }
    }
    const pctDelta = (curr: number, prev: number): number | null => {
      if (!prevHasData || prev === 0) return null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    return {
      totalSpend: totalSpendVal,
      totalDriversReceived: totalDriversVal,
      totalDecoupling: totalDecouplingVal,
      spendSeries,
      driversSeries,
      decouplingSeries,
      spendDelta: pctDelta(totalSpendVal, prevTotals.spend),
      driversDelta: pctDelta(totalDriversVal, prevTotals.drivers),
      decouplingDelta: pctDelta(totalDecouplingVal, prevTotals.decoupling),
      hasPrevPeriod: prevHasData,
      rows: filteredRows,
    };
  }, [
    activeYangoRows,
    normalizedYangoRows,
    normalizedCorpClientNameMap,
    registryByCorpId,
    selectedClientSet,
    yangoAccountManagerFilter,
    yangoClientSortDir,
    yangoClientSortKey,
    yangoFromDate,
    yangoToDate,
    yangoSalesManagerFilter,
    yangoClientSearch,
  ]);

  const [selectedYangoClients, setSelectedYangoClients] = useState<Set<string>>(new Set());
  const visibleClientIds = useMemo(
    () => decouplingData.rows.map((row) => row.clientId),
    [decouplingData.rows],
  );
  const selectedVisibleCount = useMemo(
    () => visibleClientIds.filter((id) => selectedYangoClients.has(id)).length,
    [visibleClientIds, selectedYangoClients],
  );
  const allVisibleSelected =
    visibleClientIds.length > 0 && selectedVisibleCount === visibleClientIds.length;

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedYangoClients((prev) => {
      const next = new Set(prev);
      if (visibleClientIds.every((id) => next.has(id))) {
        for (const id of visibleClientIds) next.delete(id);
      } else {
        for (const id of visibleClientIds) next.add(id);
      }
      return next;
    });
  }, [visibleClientIds]);

  const toggleSelectClient = useCallback((clientId: string) => {
    setSelectedYangoClients((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }, []);

  const yangoTableParentRef = useRef<HTMLDivElement>(null);
  const yangoRowVirtualizer = useVirtualizer({
    count: decouplingData.rows.length,
    getScrollElement: () => yangoTableParentRef.current,
    estimateSize: () => 64,
    overscan: 12,
  });

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
    setCancelInYangoError(null);
    setCancelInYangoLoading(false);
    setDetailsLoading(false);
    setCopiedField(null);
  };

  const canCancelSelectedOrderInYango = useMemo(() => {
    if (!selectedOrder) return false;
    const normalized = resolveDashboardStatus(selectedOrder);
    return (
      normalized !== "cancelled" &&
      normalized !== "in_progress" &&
      normalized !== "completed"
    );
  }, [selectedOrder]);

  const handleCancelInYango = useCallback(async () => {
    if (!selectedOrder?.clientId || cancelInYangoLoading || !canCancelSelectedOrderInYango) return;
    setCancelInYangoLoading(true);
    setCancelInYangoError(null);
    try {
      const response = await fetch("/api/yango-order-cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenLabel: selectedOrder.tokenLabel,
          clientId: selectedOrder.clientId,
          orderId: selectedOrder.orderId,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }
      setLoadedOrders((prev) =>
        prev.map((row) =>
          row.orderId === selectedOrder.orderId ? { ...row, statusRaw: "cancelled" } : row,
        ),
      );
      setSelectedOrder((prev) => (prev ? { ...prev, statusRaw: "cancelled" } : prev));
    } catch (error) {
      setCancelInYangoError(
        error instanceof Error ? error.message : "Failed to cancel order in Yango.",
      );
    } finally {
      setCancelInYangoLoading(false);
    }
  }, [canCancelSelectedOrderInYango, cancelInYangoLoading, selectedOrder]);

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

  const toggleAllYangoClients = () => {
    setYangoSelectedClients([]);
  };

  const resetYangoFilters = () => {
    const to = new Date();
    const from = new Date(to.getFullYear(), to.getMonth(), 1);
    setYangoFromDate(toDateInputValue(from));
    setYangoToDate(toDateInputValue(to));
    setYangoSelectedClients([]);
    setYangoClientSearch("");
    setYangoAccountManagerFilter("all");
    setYangoSalesManagerFilter("all");
  };

  const openRegistryClientSidebar = (corpClientId: string) => {
    const entry = registryByCorpId.get(corpClientId);
    setSelectedRegistryClientId(corpClientId);
    setManagerDraft({
      accountManagerUserId: entry?.accountManager.userId ?? "",
      salesManagerUserId: entry?.salesManager.userId ?? "",
    });
    setManagerSaveError(null);
  };

  const [openingClientId, setOpeningClientId] = useState<string | null>(null);
  const openClientProfile = async (corpClientId: string, clientName: string) => {
    if (!isB2bClientsOverview) {
      router.push(
        buildYangoClientTripsHref({
          corpClientId,
          clientName,
          from: yangoFromDate,
          to: yangoToDate,
        }),
      );
      return;
    }
    setOpeningClientId(corpClientId);
    try {
      const res = await fetch("/api/sales-operation/b2b-clients/ensure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corpClientId, clientName }),
      });
      const data = (await res.json()) as { ok?: boolean; clientId?: string; error?: string };
      if (!res.ok || !data.ok || !data.clientId) {
        throw new Error(data.error ?? "Failed to open client profile.");
      }
      router.push(`/sales-operation/b2b-clients/${data.clientId}`);
    } catch (error) {
      console.error(error);
      setOpeningClientId(null);
    }
  };

  const saveRegistryManagers = async () => {
    if (!selectedRegistryClientId) return;
    setManagerSaving(true);
    setManagerSaveError(null);
    try {
      const response = await fetch(
        `/api/sales-operation/b2b-clients/${encodeURIComponent(selectedRegistryClientId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountManagerUserId: managerDraft.accountManagerUserId || null,
            salesManagerUserId: managerDraft.salesManagerUserId || null,
          }),
        },
      );
      const payload = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Failed to update managers.");
      }
      onB2BRegistryUpdated?.();
      setSelectedRegistryClientId(null);
    } catch (error) {
      setManagerSaveError(error instanceof Error ? error.message : "Failed to update managers.");
    } finally {
      setManagerSaving(false);
    }
  };

  const toggleYangoClient = (clientId: string) => {
    setYangoSelectedClients((prev) =>
      prev.includes(clientId) ? prev.filter((item) => item !== clientId) : [...prev, clientId],
    );
  };

  const toggleYangoClientSort = (key: YangoClientSortKey) => {
    if (yangoClientSortKey === key) {
      setYangoClientSortDir((prevDir) => (prevDir === "asc" ? "desc" : "asc"));
      return;
    }
    setYangoClientSortKey(key);
    setYangoClientSortDir(key === "clientId" ? "asc" : "desc");
  };

  const renderYangoSortIndicator = (key: YangoClientSortKey) => {
    if (yangoClientSortKey !== key) {
      return <span className="text-slate-400">↕</span>;
    }
    return <span className="text-slate-700">{yangoClientSortDir === "asc" ? "↑" : "↓"}</span>;
  };

  const exportOrdersCsv = () => {
    if (filteredRows.length === 0) return;
    const escapeCsv = (value: string | number) => {
      const text = String(value);
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };
    const headers = [
      "order_id",
      "client_name",
      "status",
      "status_raw",
      "scheduled_at",
      "scheduled_for",
      "client_paid",
      "token_label",
      "client_id",
    ];
    const rowsCsv = filteredRows.map((row) => {
      const displayStatus = getOrderStatusDisplay(row);
      return [
        row.orderId,
        row.clientName,
        displayStatus.label,
        row.statusRaw ?? "",
        row.createdAt,
        row.scheduledAt,
        row.clientPaid,
        row.tokenLabel,
        row.clientId ?? "",
      ]
        .map(escapeCsv)
        .join(",");
    });
    const csv = [headers.join(","), ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `orders_export_${fromDate}_${toDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const closeGpUploadModal = useCallback(() => {
    setGpUploadModalOpen(false);
    setGpUploadResult(null);
    setGpUploadError(null);
    if (gpUploadRefreshOnClose) {
      setGpUploadRefreshOnClose(false);
      router.refresh();
    }
  }, [gpUploadRefreshOnClose, router]);

  const handleGpTripsUpload = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;

      setGpUploading(true);
      setGpUploadError(null);
      setGpUploadResult(null);
      setGpUploadRefreshOnClose(false);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/dashboard/gp-trips/upload", {
          method: "POST",
          body: formData,
        });
        const payload = (await response.json()) as GpTripsImportResult & { ok?: boolean; error?: string };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? "Upload failed.");
        }
        setGpUploadResult(payload);
        setGpUploadRefreshOnClose(true);
        setGpUploadModalOpen(true);
      } catch (error) {
        setGpUploadError(error instanceof Error ? error.message : "Upload failed.");
        setGpUploadModalOpen(true);
      } finally {
        setGpUploading(false);
      }
    },
    [],
  );

  const exportYangoClientsCsv = (
    rowsToExport: typeof decouplingData.rows = decouplingData.rows,
  ) => {
    if (rowsToExport.length === 0) return;
    const escapeCsv = (value: string | number) => {
      const text = String(value);
      if (text.includes(",") || text.includes("\"") || text.includes("\n")) {
        return `"${text.replace(/"/g, "\"\"")}"`;
      }
      return text;
    };
    const headers = [
      "client_name",
      "corp_client_id",
      "account_manager",
      "sales_manager",
      "requests",
      "trips",
      "abs_spend",
      "abs_decoupling",
      "decoupling_rate_percent",
      "last_trip_date",
    ];
    const rowsCsv = rowsToExport.map((row) =>
      [
        row.clientName,
        row.clientId,
        row.accountManagerName ?? "",
        row.salesManagerName ?? "",
        row.requests,
        row.trips,
        row.spend,
        row.decoupling,
        row.rate,
        row.lastTripDate ?? "",
      ]
        .map(escapeCsv)
        .join(","),
    );
    const csv = [headers.join(","), ...rowsCsv].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yango_clients_${yangoFromDate}_${yangoToDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
    <section
      className={
        view === "orders" || isB2bClientsOverview ? "" : "glass-surface mt-6 rounded-3xl p-4"
      }
    >

      {view === "orders" && ordersRemote?.bootstrapErrors && ordersRemote.bootstrapErrors.length > 0 ? (
        <div className="mb-0.5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Some clients are unavailable</p>
          <p className="mt-1">
            {ordersRemote.bootstrapErrors
              .slice(0, 4)
              .join(" | ")}
          </p>
        </div>
      ) : null}

      {(view === "orders" || (view === "dashboard" && showApiDashboardSection)) ? (
      <div
        className={
          view === "orders"
            ? "mb-0.5 glass-surface overflow-hidden rounded-3xl p-4"
            : "mb-0.5 rounded-2xl border border-border bg-panel p-3"
        }
      >
        <div className="grid w-full min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
          <label className="flex min-w-0 flex-col items-center text-center text-xs font-semibold uppercase tracking-wide text-muted">
            From
            <input
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              className="crm-input mt-1.5 block h-10 min-h-10 w-full min-w-0 px-2.5 text-center text-sm text-slate-800"
            />
          </label>
          <label className="flex min-w-0 flex-col items-center text-center text-xs font-semibold uppercase tracking-wide text-muted">
            To
            <input
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              className="crm-input mt-1.5 block h-10 min-h-10 w-full min-w-0 px-2.5 text-center text-sm text-slate-800"
            />
          </label>
          {isClientScopedUser ? (
            <label className="flex min-w-0 flex-col items-center text-center text-xs font-semibold uppercase tracking-wide text-muted">
              Client
              <div className="crm-input mt-1.5 flex h-10 min-h-10 w-full min-w-0 items-center justify-center px-2.5 text-center text-sm font-semibold text-slate-800">
                {fixedClientName ?? "Client from your cabinet"}
              </div>
            </label>
          ) : (
            <label className="flex min-w-0 flex-col items-center text-center text-xs font-semibold uppercase tracking-wide text-muted">
              Client
              <select
                value={clientFilter}
                onChange={(event) => setClientFilter(event.target.value)}
                className="crm-input mt-1.5 block h-10 min-h-10 w-full min-w-0 px-2.5 text-center text-sm text-slate-800"
              >
                {clientOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === "all" ? "All clients" : option}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="flex min-w-0 flex-col items-center text-center text-xs font-semibold uppercase tracking-wide text-muted">
            Status
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="crm-input mt-1.5 block h-10 min-h-10 w-full min-w-0 px-2.5 text-center text-sm text-slate-800"
            >
              <option value="all">All statuses</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              {view === "orders" ? <option value="in_progress">In Progress</option> : null}
              {view === "dashboard" ? <option value="pending">Pending</option> : null}
            </select>
          </label>
          <label className="flex min-w-0 flex-col items-center text-center text-xs font-semibold uppercase tracking-wide text-muted">
            Sort
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="crm-input mt-1.5 block h-10 min-h-10 w-full min-w-0 px-2.5 text-center text-sm text-slate-800"
            >
              <option value="date_desc">Date desc</option>
              <option value="date_asc">Date asc</option>
              <option value="client_asc">Client A-Z</option>
              <option value="client_desc">Client Z-A</option>
            </select>
          </label>
        </div>
      </div>
      ) : null}

      {view === "orders" ? (
        <div className="mb-0.5 grid gap-2 md:grid-cols-3">
          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === "completed" ? "all" : "completed"))
            }
            className={`rounded-2xl border border-emerald-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_22px_rgba(16,185,129,0.12)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_28px_rgba(16,185,129,0.18)] ${
              statusFilter === "completed" ? "ring-2 ring-emerald-300" : ""
            }`}
          >
            <p className="text-xs text-muted">Completed orders</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{ordersSummary.completed}</p>
          </button>
          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === "cancelled" ? "all" : "cancelled"))
            }
            className={`rounded-2xl border border-rose-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#fff1f2_100%)] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_22px_rgba(244,63,94,0.12)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_28px_rgba(244,63,94,0.18)] ${
              statusFilter === "cancelled" ? "ring-2 ring-rose-300" : ""
            }`}
          >
            <p className="text-xs text-muted">Canceled</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{ordersSummary.cancelled}</p>
          </button>
          <button
            type="button"
            onClick={() =>
              setStatusFilter((prev) => (prev === "in_progress" ? "all" : "in_progress"))
            }
            className={`rounded-2xl border border-amber-200/70 bg-[linear-gradient(180deg,#ffffff_0%,#fffbeb_100%)] p-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_10px_22px_rgba(245,158,11,0.12)] transition hover:-translate-y-0.5 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_14px_28px_rgba(245,158,11,0.18)] ${
              statusFilter === "in_progress" ? "ring-2 ring-amber-300" : ""
            }`}
          >
            <p className="text-xs text-muted">In Progress</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{ordersSummary.inProgress}</p>
          </button>
        </div>
      ) : null}

      {view === "dashboard" ? (
        <>
          {showApiDashboardSection ? (
          <section className="mb-4 rounded-3xl border border-white/70 bg-white/70 p-4">
            <div className="mb-3">
              <h3 className="crm-section-title">API Data</h3>
              <p className="crm-subtitle">Dashboards based on live API-loaded orders</p>
            </div>
            <div className="mb-4 grid gap-3 xl:grid-cols-2">
              <B2BOpsTrendChart
                title="Requests"
                subtitle="Total incoming client requests."
                points={apiOpsData.points}
                comparePoints={apiOpsData.comparePoints}
                series={["requests"]}
              />
              <B2BOpsTrendChart
                title="Trips"
                subtitle="Successful completed trips."
                points={apiOpsData.points}
                comparePoints={apiOpsData.comparePoints}
                series={["trips"]}
              />
              <B2BOpsTrendChart
                title="Acceptance Rate"
                subtitle="Share of requests accepted by drivers."
                points={apiOpsData.points}
                comparePoints={apiOpsData.comparePoints}
                series={["acceptanceRate"]}
              />
              <B2BOpsTrendChart
                title="Completed to Request"
                subtitle="Conversion from request to successful trip."
                points={apiOpsData.points}
                comparePoints={apiOpsData.comparePoints}
                series={["completedToRequest"]}
              />
              <B2BOpsTrendChart
                title="Rider Cancels %"
                subtitle="User-initiated cancellations share."
                points={apiOpsData.points}
                comparePoints={apiOpsData.comparePoints}
                series={["riderCancelsPct"]}
              />
              <B2BOpsTrendChart
                title="Driver Cancels %"
                subtitle="Driver-initiated cancellations share."
                points={apiOpsData.points}
                comparePoints={apiOpsData.comparePoints}
                series={["driverCancelsPct"]}
              />
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              <ClientSpendCard
                series={dashboardData.series}
                totalSpent={dashboardData.totalSpent}
                clientSeries={dashboardData.clientSeries}
                maxClientSpend={dashboardData.maxSpent}
                axisStep={dashboardData.axisStep}
              />
              <YangoTopClientsCard clients={apiTopClients} />
            </div>
          </section>
          ) : null}

          {!canSeeApiData ? (
            <section className="mb-2 rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Your role has no access to Dashboard blocks. Ask Admin to enable API Data.
            </section>
          ) : null}
        </>
      ) : null}

      {showYangoClientsOverview ? (
          <section className="mb-2 rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="grid w-full gap-2 sm:w-auto sm:grid-flow-col sm:auto-cols-max sm:items-end">
                <label className="text-xs text-muted">
                  From
                  <input
                    type="date"
                    value={yangoFromDate}
                    onChange={(event) => setYangoFromDate(event.target.value)}
                    className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 sm:w-auto"
                  />
                </label>
                <label className="text-xs text-muted">
                  To
                  <input
                    type="date"
                    value={yangoToDate}
                    onChange={(event) => setYangoToDate(event.target.value)}
                    className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 sm:w-auto"
                  />
                </label>
                <label className="text-xs text-muted">
                  Client search
                  <input
                    type="text"
                    value={yangoClientSearch}
                    onChange={(event) => setYangoClientSearch(event.target.value)}
                    placeholder="Name or corp_client_id"
                    className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 sm:w-56"
                  />
                </label>
                <label className="text-xs text-muted">
                  Account Manager
                  <select
                    value={yangoAccountManagerFilter}
                    onChange={(event) => setYangoAccountManagerFilter(event.target.value)}
                    className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 sm:w-44"
                  >
                    <option value="all">All</option>
                    {accountManagerOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-muted">
                  Sales Manager
                  <select
                    value={yangoSalesManagerFilter}
                    onChange={(event) => setYangoSalesManagerFilter(event.target.value)}
                    className="crm-input mt-1 block h-9 w-full px-2.5 text-sm text-slate-700 sm:w-44"
                  >
                    <option value="all">All</option>
                    {salesManagerOptions.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} ({user.role})
                      </option>
                    ))}
                  </select>
                </label>
                <details className="rounded-xl border border-border bg-white/85 px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    Client filter ({yangoSelectedClients.length === 0 ? "All" : yangoSelectedClients.length})
                  </summary>
                  <div className="mt-2 max-h-44 space-y-1 overflow-auto pr-1 text-xs text-slate-700">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={yangoSelectedClients.length === 0}
                        onChange={toggleAllYangoClients}
                      />
                      All clients
                    </label>
                    {filteredYangoClientOptions.map((client) => (
                      <label key={client.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={yangoSelectedClients.includes(client.id)}
                          onChange={() => toggleYangoClient(client.id)}
                        />
                        <span>{client.name}</span>
                        {client.name !== client.id ? (
                          <span className="text-[11px] text-slate-500">({client.id})</span>
                        ) : null}
                      </label>
                    ))}
                    {filteredYangoClientOptions.length === 0 ? (
                      <p className="text-[11px] text-slate-500">No clients match this search.</p>
                    ) : null}
                  </div>
                </details>
                <button
                  type="button"
                  onClick={resetYangoFilters}
                  className="rounded-xl border border-border bg-white/85 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-white"
                >
                  Reset filters
                </button>
              </div>
            </div>

            {activeYangoRows.length === 0 ? (
              <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                No rows in selected date/client filters.
              </div>
            ) : null}

            <div className="mb-4 grid gap-3 md:grid-cols-3">
              <StatTile
                label="Client Spend"
                value={formatMoney(decouplingData.totalSpend)}
                icon={<Wallet className="h-4 w-4" />}
                spark={decouplingData.spendSeries}
                delta={
                  decouplingData.spendDelta !== null
                    ? { value: decouplingData.spendDelta, label: "vs prev" }
                    : undefined
                }
              />
              <StatTile
                label="Drivers Received"
                value={formatMoney(decouplingData.totalDriversReceived)}
                icon={<HandCoins className="h-4 w-4" />}
                sparkTone="#0ea5e9"
                spark={decouplingData.driversSeries}
                delta={
                  decouplingData.driversDelta !== null
                    ? { value: decouplingData.driversDelta, label: "vs prev" }
                    : undefined
                }
              />
              <StatTile
                label="ABS Decoupling"
                value={formatMoney(decouplingData.totalDecoupling)}
                icon={<Split className="h-4 w-4" />}
                tone={decouplingData.totalDecoupling < 0 ? "danger" : "default"}
                sparkTone={decouplingData.totalDecoupling < 0 ? "#e11d48" : "var(--so-accent)"}
                spark={decouplingData.decouplingSeries}
                delta={
                  decouplingData.decouplingDelta !== null
                    ? { value: decouplingData.decouplingDelta, label: "vs prev", invert: true }
                    : undefined
                }
              />
            </div>

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="min-h-[34px]">
                {selectedVisibleCount > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-[var(--so-accent)]/40 bg-[var(--so-accent-soft)] px-2.5 py-1.5">
                    <span className="text-xs font-semibold text-[var(--so-accent-strong)]">
                      {selectedVisibleCount} selected
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        exportYangoClientsCsv(
                          decouplingData.rows.filter((row) => selectedYangoClients.has(row.clientId)),
                        )
                      }
                      className="so-focus-ring inline-flex items-center gap-1 rounded-[8px] bg-[var(--so-accent)] px-2.5 py-1 text-xs font-semibold text-white transition-colors hover:bg-[var(--so-accent-strong)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export selected
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedYangoClients(new Set())}
                      className="so-focus-ring inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-xs font-semibold text-[var(--so-accent-strong)] transition-colors hover:bg-white/60"
                    >
                      <X className="h-3.5 w-3.5" />
                      Clear
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
              <input
                ref={gpUploadInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(event) => void handleGpTripsUpload(event)}
              />
              {canSeeYangoData ? (
                <button
                  type="button"
                  onClick={() => gpUploadInputRef.current?.click()}
                  disabled={gpUploading}
                  className="so-focus-ring rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {gpUploading ? "Uploading…" : "Upload Data"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => exportYangoClientsCsv()}
                disabled={decouplingData.rows.length === 0}
                className="so-focus-ring rounded-[10px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-3 py-1.5 text-xs font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Export clients CSV
              </button>
              </div>
            </div>
            <div
              ref={yangoTableParentRef}
              className="max-h-[70vh] overflow-auto rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)]"
            >
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-[1] bg-[var(--so-surface-2)] text-[0.6875rem] font-bold uppercase tracking-wide text-[var(--so-muted)]">
                  <tr>
                    <th className="w-9 px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={toggleSelectAllVisible}
                        aria-label="Select all"
                        className={`so-focus-ring flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${
                          allVisibleSelected
                            ? "border-[var(--so-accent)] bg-[var(--so-accent)] text-white"
                            : "border-[var(--so-border-strong)] bg-[var(--so-surface)] hover:border-[var(--so-accent)]"
                        }`}
                      >
                        {allVisibleSelected ? <CheckSquare className="h-3 w-3" /> : null}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("clientId")}
                        className="inline-flex items-center gap-1"
                      >
                        Client {renderYangoSortIndicator("clientId")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("accountManager")}
                        className="inline-flex items-center gap-1"
                      >
                        Account Manager {renderYangoSortIndicator("accountManager")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-left">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("salesManager")}
                        className="inline-flex items-center gap-1"
                      >
                        Sales Manager {renderYangoSortIndicator("salesManager")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("requests")}
                        className="inline-flex items-center gap-1"
                      >
                        Requests {renderYangoSortIndicator("requests")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("trips")}
                        className="inline-flex items-center gap-1"
                      >
                        Trips {renderYangoSortIndicator("trips")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("spend")}
                        className="inline-flex items-center gap-1"
                      >
                        ABS spend {renderYangoSortIndicator("spend")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("decoupling")}
                        className="inline-flex items-center gap-1"
                      >
                        ABS Decoupling {renderYangoSortIndicator("decoupling")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("rate")}
                        className="inline-flex items-center gap-1"
                      >
                        Decoupling Rate {renderYangoSortIndicator("rate")}
                      </button>
                    </th>
                    <th className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => toggleYangoClientSort("lastTripDate")}
                        className="inline-flex items-center gap-1"
                      >
                        Last trip date {renderYangoSortIndicator("lastTripDate")}
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const virtualItems = yangoRowVirtualizer.getVirtualItems();
                    const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
                    const paddingBottom =
                      virtualItems.length > 0
                        ? yangoRowVirtualizer.getTotalSize() -
                          virtualItems[virtualItems.length - 1].end
                        : 0;
                    return (
                      <>
                        {paddingTop > 0 ? (
                          <tr aria-hidden>
                            <td colSpan={10} style={{ height: paddingTop }} />
                          </tr>
                        ) : null}
                        {virtualItems.map((virtualRow) => {
                          const row = decouplingData.rows[virtualRow.index];
                          const selected = selectedYangoClients.has(row.clientId);
                          return (
                    <tr
                      key={row.clientId}
                      data-index={virtualRow.index}
                      ref={yangoRowVirtualizer.measureElement}
                      className={`border-b border-[var(--so-border)] transition-colors ${
                        selected
                          ? "bg-[var(--so-accent-soft)]"
                          : row.decoupling < 0
                            ? "bg-rose-50/70 hover:bg-rose-50"
                            : "hover:bg-[var(--so-surface-hover)]"
                      }`}
                    >
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          onClick={() => toggleSelectClient(row.clientId)}
                          aria-label="Select row"
                          className={`so-focus-ring mt-0.5 flex h-4 w-4 items-center justify-center rounded-[4px] border transition-colors ${
                            selected
                              ? "border-[var(--so-accent)] bg-[var(--so-accent)] text-white"
                              : "border-[var(--so-border-strong)] bg-[var(--so-surface)] hover:border-[var(--so-accent)]"
                          }`}
                        >
                          {selected ? <CheckSquare className="h-3 w-3" /> : null}
                        </button>
                      </td>
                      <td className="px-3 py-2 align-top text-[var(--so-text)]">
                        <div className="px-1 py-0.5">
                          <button
                            type="button"
                            disabled={openingClientId === row.clientId}
                            onClick={() => void openClientProfile(row.clientId, row.clientName)}
                            className="group/client block w-full rounded-lg text-left transition-colors disabled:opacity-60"
                          >
                            <div className="font-semibold text-[var(--so-text)] group-hover/client:text-[var(--so-accent-strong)]">
                              {openingClientId === row.clientId ? "Opening…" : row.clientName}
                            </div>
                            {row.clientName !== row.clientId ? (
                              <div className="text-[11px] text-[var(--so-muted-2)]">{row.clientId}</div>
                            ) : null}
                          </button>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <Link
                              href={buildYangoClientTripsHref({
                                corpClientId: row.clientId,
                                clientName: row.clientName,
                                from: yangoFromDate,
                                to: yangoToDate,
                              })}
                              className="inline-flex text-[11px] font-medium text-[var(--so-muted)] transition-colors hover:text-[var(--so-accent-strong)]"
                            >
                              Trips
                            </Link>
                            <span className="text-[11px] text-[var(--so-muted-2)]" aria-hidden>
                              ·
                            </span>
                            <a
                              href={`https://corp-admin-frontend.taxi.yandex-team.ru/corp-clients?search=${encodeURIComponent(
                                row.clientId,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex text-[11px] font-medium text-[var(--so-muted)] transition-colors hover:text-[var(--so-accent-strong)]"
                            >
                              Open in corp admin
                            </a>
                            {isB2bClientsOverview ? (
                              <>
                                <span className="text-[11px] text-[var(--so-muted-2)]" aria-hidden>
                                  ·
                                </span>
                                <button
                                  type="button"
                                  onClick={() => openRegistryClientSidebar(row.clientId)}
                                  className="inline-flex text-[11px] font-semibold text-[var(--so-accent-strong)] transition-colors hover:underline"
                                >
                                  Edit managers
                                </button>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-[var(--so-muted)]">{row.accountManagerName ?? "—"}</td>
                      <td className="px-3 py-2 align-top text-[var(--so-muted)]">{row.salesManagerName ?? "—"}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--so-text)]">{row.requests.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--so-text)]">{row.trips.toLocaleString("en-US")}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--so-text)]">{formatMoney(row.spend)}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--so-text)]">{formatMoney(row.decoupling)}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--so-text)]">{formatPercent(row.rate)}</td>
                      <td className="px-3 py-2 text-right align-top tabular-nums text-[var(--so-text)]">
                        {row.lastTripDate ? formatDateTimeCell(row.lastTripDate) : "n/a"}
                      </td>
                    </tr>
                          );
                        })}
                        {paddingBottom > 0 ? (
                          <tr aria-hidden>
                            <td colSpan={10} style={{ height: paddingBottom }} />
                          </tr>
                        ) : null}
                      </>
                    );
                  })()}
                  {decouplingData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-3 py-6 text-center text-[var(--so-muted)]">
                        No client rows for selected filters.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
      ) : null}

      {isB2bClientsOverview ? (
        <Drawer
          open={Boolean(selectedRegistryClientId)}
          onOpenChange={(open) => {
            if (!open) setSelectedRegistryClientId(null);
          }}
          title="B2B client managers"
          description={selectedRegistryClientId ?? undefined}
          footer={
            <Button
              className="w-full"
              loading={managerSaving}
              disabled={managerSaving}
              onClick={() => void saveRegistryManagers()}
            >
              Save managers
            </Button>
          }
        >
          <div className="space-y-3 px-5 py-4 text-sm">
            {managerSaveError ? <p className="text-sm text-rose-600">{managerSaveError}</p> : null}
            <label className="block">
              <span className="crm-label">Account Manager</span>
              <select
                value={managerDraft.accountManagerUserId}
                onChange={(event) =>
                  setManagerDraft((prev) => ({ ...prev, accountManagerUserId: event.target.value }))
                }
                className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
              >
                <option value="">Unassigned</option>
                {accountManagerOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="crm-label">Sales Manager</span>
              <select
                value={managerDraft.salesManagerUserId}
                onChange={(event) =>
                  setManagerDraft((prev) => ({ ...prev, salesManagerUserId: event.target.value }))
                }
                className="crm-input mt-1 block h-9 w-full px-2.5 text-sm"
              >
                <option value="">Unassigned</option>
                {salesManagerOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Drawer>
      ) : null}
    </section>

    {view === "orders" ? (
    <section className="glass-surface mt-0.5 overflow-hidden rounded-3xl">
        {remoteError ? (
          <div className="border-b border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{remoteError}</div>
        ) : null}
        <div className="flex items-center justify-end gap-2 border-b border-border/70 bg-white/60 px-3 py-2">
          {ordersRemote && remoteLoading ? (
            <span className="text-xs text-muted">Loading orders…</span>
          ) : null}
          <button
            type="button"
            onClick={exportOrdersCsv}
            disabled={filteredRows.length === 0}
            className="rounded-lg border border-border/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2">
            <thead className="bg-[#f6f6f8]">
              <tr>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  Order
                </th>
                {!isClientScopedUser ? (
                  <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                    Client
                  </th>
                ) : null}
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  Status
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  Scheduled for{" "}
                  <span className="normal-case text-[11px] font-normal text-slate-500">
                    (ride time)
                  </span>
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  Client paid
                </th>
                <th className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted">
                  Adminka
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const displayStatus = getOrderStatusDisplay(row);
                const rowTint =
                  displayStatus.tone === "completed"
                    ? "[&>td]:bg-emerald-50/45"
                    : displayStatus.tone === "cancelled"
                      ? "[&>td]:bg-rose-50/45"
                      : displayStatus.tone === "in_progress"
                        ? "[&>td]:bg-sky-50/45"
                        : "[&>td]:bg-slate-50/45";
                return (
                  <tr
                    key={`${row.tokenLabel}:${row.orderId}`}
                    className={`group cursor-pointer transition-all duration-200 ease-out hover:-translate-y-0.5 hover:drop-shadow-[0_14px_36px_rgba(15,23,42,0.14)] ${rowTint} hover:[&>td]:bg-white/95`}
                    onClick={() => openOrderModal(row)}
                  >
                    <td className="rounded-l-xl border border-transparent px-3 py-2.5 text-center text-sm font-medium text-slate-900 transition-colors duration-200">
                      {row.orderId}
                    </td>
                    {!isClientScopedUser ? (
                      <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700 transition-colors duration-200">
                        {row.clientName}
                      </td>
                    ) : null}
                    <td className="border border-transparent px-3 py-2.5 text-center text-sm transition-colors duration-200">
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <span
                          className={`crm-status-pill ${
                            displayStatus.tone === "completed"
                              ? "crm-status-pill--completed"
                              : displayStatus.tone === "cancelled"
                                ? "crm-status-pill--danger"
                                : displayStatus.tone === "in_progress"
                                  ? "crm-status-pill--progress"
                                  : "crm-status-pill--muted"
                          }`}
                        >
                          {displayStatus.label}
                        </span>
                      </div>
                    </td>
                    <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700 transition-colors duration-200">
                      {row.scheduledAt}
                    </td>
                    <td className="border border-transparent px-3 py-2.5 text-center text-sm text-slate-700 transition-colors duration-200">
                      {formatMoney(row.clientPaid)}
                    </td>
                    <td className="rounded-r-xl border border-transparent px-3 py-2.5 text-center text-sm transition-colors duration-200">
                      <Link
                        href={`https://go-admin-frontend.taxi.yandex-team.ru/orders/${row.orderId}`}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white/85 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-white"
                        onClick={(event) => event.stopPropagation()}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Order in Adminka
                      </Link>
                    </td>
                  </tr>
                );
              })}
              {filteredRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={isClientScopedUser ? 5 : 6}
                    className="px-3 py-8 text-center text-sm text-muted"
                  >
                    No orders for selected filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {ordersRemote && hasMoreRemote ? (
          <div className="border-t border-border/70 bg-white/40 px-3 py-2">
            <button
              type="button"
              onClick={() => void handleLoadMoreOrders()}
              disabled={remoteLoading}
              className="crm-hover-lift rounded-lg border border-border/80 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Load more orders
            </button>
          </div>
        ) : null}
    </section>
    ) : null}

    {gpUploadModalOpen ? (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
        onClick={closeGpUploadModal}
      >
        <div
          className="crm-modal-surface w-full max-w-md rounded-3xl p-4 lg:p-5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3 px-1">
            <h3 className="text-xl font-semibold text-foreground">
              {gpUploadError ? "Upload failed" : "Upload complete"}
            </h3>
            <button
              type="button"
              onClick={closeGpUploadModal}
              className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-lg font-semibold leading-none text-slate-700"
              aria-label="Close modal"
            >
              ×
            </button>
          </div>
          {gpUploadError ? (
            <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {gpUploadError}
            </p>
          ) : gpUploadResult ? (
            <dl className="space-y-2 text-sm text-slate-700">
              <div className="flex justify-between gap-4">
                <dt>Added trips</dt>
                <dd className="font-semibold text-slate-900">{gpUploadResult.inserted}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Unique in file</dt>
                <dd className="font-semibold text-slate-900">{gpUploadResult.uniqueInFile}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Duplicates in file</dt>
                <dd className="font-semibold text-slate-900">{gpUploadResult.duplicatesInFile}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt>Already in database</dt>
                <dd className="font-semibold text-slate-900">{gpUploadResult.skippedExistingInDb}</dd>
              </div>
            </dl>
          ) : null}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={closeGpUploadModal}
              className="crm-button-primary px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {selectedOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8 backdrop-blur-sm"
          onClick={closeOrderModal}
        >
          <div
            className="crm-modal-surface w-full max-w-4xl rounded-3xl p-4 lg:p-5"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3 px-1">
              <h3 className="text-xl font-semibold text-foreground">B2B Order {selectedOrder.orderId}</h3>
              <button
                type="button"
                onClick={closeOrderModal}
                className="crm-hover-lift inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-lg font-semibold leading-none text-slate-700"
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
                        <dt className="text-muted">Scheduled for</dt>
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
                  {view === "orders" && canCancelSelectedOrderInYango ? (
                    <div className="mb-4">
                      <button
                        type="button"
                        onClick={() => void handleCancelInYango()}
                        disabled={cancelInYangoLoading}
                        className="crm-hover-lift inline-flex w-full items-center justify-center rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {cancelInYangoLoading ? "Cancelling..." : "Cancel in Yango"}
                      </button>
                    </div>
                  ) : null}
                  {cancelInYangoError ? (
                    <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {cancelInYangoError}
                    </p>
                  ) : null}
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
                      <dt className="text-muted">Scheduled at</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.createdAt}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Scheduled for</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.scheduledAt}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Client</dt>
                      <dd className="font-medium text-slate-900">{selectedOrder.clientName}</dd>
                    </div>
                    <div>
                      <dt className="text-muted">Client paid</dt>
                      <dd className="font-medium text-slate-900">{formatMoney(selectedOrder.clientPaid)}</dd>
                    </div>
                    {view !== "orders" ? (
                      <>
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
                      </>
                    ) : null}
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
