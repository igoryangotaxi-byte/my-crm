"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import type {
  DriverAnalyticsReport,
  DriverLicenseAnalyticsReport,
} from "@/lib/drivers-pipeline/analytics";
import { rowsToCsv } from "@/lib/sales-operation/analytics";
import { StatTile } from "@/components/ui/StatTile";
import { ChartCard } from "@/components/ui/ChartCard";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

function ChartSkeleton() {
  return <Skeleton className="h-72 w-full rounded-[12px]" />;
}

const DriversStatusBarChart = dynamic(
  () => import("./DriversLeadsCharts").then((m) => m.DriversStatusBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const DriversLicenseMixChart = dynamic(
  () => import("./DriversLeadsCharts").then((m) => m.DriversLicenseMixChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const DriversHorizontalBarChart = dynamic(
  () => import("./DriversLeadsCharts").then((m) => m.DriversHorizontalBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const DriversIntakeLineChart = dynamic(
  () => import("./DriversLeadsCharts").then((m) => m.DriversIntakeLineChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const csv = rowsToCsv(rows);
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function formatDays(value: number | null): string {
  if (value == null) return "—";
  return `${value.toFixed(1)}d`;
}

function DashboardSkeleton() {
  return (
    <section className="crm-page space-y-4 p-4 sm:px-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </section>
  );
}

const tableWrap = "overflow-auto rounded-[12px] border border-[var(--so-border)]";
const tableHead = "bg-[var(--so-surface-2)] text-[var(--so-muted)]";
const tableCls = "min-w-full text-xs";

export function DriversLeadsDashboard() {
  const [report, setReport] = useState<DriverAnalyticsReport | null>(null);
  const [license, setLicense] = useState<DriverLicenseAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      const res = await fetch(
        `/api/sales-operation/drivers-leads/analytics${qs ? `?${qs}` : ""}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        ok?: boolean;
        report?: DriverAnalyticsReport;
        license?: DriverLicenseAnalyticsReport;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.report) {
        throw new Error(json.error ?? "Failed to load drivers analytics.");
      }
      setReport(json.report);
      setLicense(json.license ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load drivers analytics.");
      setReport(null);
      setLicense(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(dateFrom, dateTo);
  }, [load, dateFrom, dateTo]);

  if (loading && !report) {
    return <DashboardSkeleton />;
  }

  if (error && !report) {
    return (
      <section className="crm-page p-4 sm:px-5">
        <div className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4">
          <EmptyState icon={<BarChart3 className="h-5 w-5" />} title={error} />
        </div>
      </section>
    );
  }

  if (!report) return null;

  const topAssignees = report.byAssignee.slice(0, 12).map((row) => ({
    label: row.label,
    count: row.total,
  }));
  const topRejects = report.byRejectReason.slice(0, 12).map((row) => ({
    label: row.label,
    count: row.count,
  }));

  return (
    <section className="crm-page space-y-4 overflow-y-auto p-4 sm:px-5">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-[14px] border border-[var(--so-border)] bg-[var(--so-surface)] px-3.5 py-3 shadow-[var(--so-shadow-xs)]">
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-xs">
            <span className="crm-label">Received from</span>
            <input
              type="date"
              className="crm-input h-9 text-sm"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1 text-xs">
            <span className="crm-label">Received to</span>
            <input
              type="date"
              className="crm-input h-9 text-sm"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          {dateFrom || dateTo ? (
            <Button
              variant="secondary"
              className="h-9"
              onClick={() => {
                setDateFrom("");
                setDateTo("");
              }}
            >
              Clear dates
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs text-[var(--so-muted)]">
            {loading
              ? "Refreshing…"
              : `${report.filteredTotal.toLocaleString()} leads${
                  report.excludedNoLicenseCount > 0
                    ? ` · ${report.excludedNoLicenseCount.toLocaleString()} No license excluded`
                    : ""
                }`}
          </p>
          <Button
            variant="secondary"
            className="h-9"
            onClick={() => {
              downloadCsv("drivers-leads-by-status.csv", [
                ["Status", "Count"],
                ...report.byStatus.map((row) => [row.label, row.count]),
              ]);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Status CSV
          </Button>
          <Button
            variant="secondary"
            className="h-9"
            onClick={() => {
              downloadCsv("drivers-leads-by-assignee.csv", [
                [
                  "Assignee",
                  "Total",
                  "New",
                  "In Progress",
                  "Registered",
                  "Rejected",
                  "Conversion %",
                ],
                ...report.byAssignee.map((row) => [
                  row.label,
                  row.total,
                  row.new,
                  row.inProgress,
                  row.registered,
                  row.rejected,
                  row.conversionPct,
                ]),
              ]);
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Assignee CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
        <StatTile label="Total" value={report.kpis.total.toLocaleString()} />
        <StatTile label="New" value={report.kpis.new.toLocaleString()} />
        <StatTile label="In Progress" value={report.kpis.inProgress.toLocaleString()} />
        <StatTile
          label="Registered"
          value={report.kpis.registered.toLocaleString()}
          tone="success"
        />
        <StatTile
          label="Rejected"
          value={report.kpis.rejected.toLocaleString()}
          tone="danger"
        />
        <StatTile label="Open pipeline" value={report.kpis.open.toLocaleString()} />
        <StatTile
          label="Conversion"
          value={`${report.kpis.conversionPct}%`}
          hint="Registered / (Registered + Rejected)"
          tone="accent"
        />
      </div>

      {license ? (
        <ChartCard
          title="Taxi license — With vs Without"
          action={
            <Link
              href="/sales-operation/drivers-leads/license"
              className="text-xs font-semibold text-[var(--so-accent-strong)] hover:underline"
            >
              Open license dashboard →
            </Link>
          }
          isEmpty={license.byBucket.every((row) => row.count === 0)}
          emptyLabel="No license data"
        >
          <DriversLicenseMixChart data={license.byBucket} />
          <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--so-muted)]">
            {license.byBucket.map((row) => (
              <li key={row.key} className="inline-flex items-center gap-1.5 font-medium">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    background:
                      row.key === "with"
                        ? "#059669"
                        : row.key === "without"
                          ? "#FF2D2D"
                          : "#6B7280",
                  }}
                />
                {row.label}: {row.count.toLocaleString()}
              </li>
            ))}
          </ul>
        </ChartCard>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="By status"
          isEmpty={report.byStatus.every((row) => row.count === 0)}
          emptyLabel="No leads in range"
        >
          <DriversStatusBarChart data={report.byStatus} />
        </ChartCard>
        <ChartCard
          title="By assignee (top 12)"
          isEmpty={topAssignees.length === 0}
          emptyLabel="No assignees"
        >
          <DriversHorizontalBarChart data={topAssignees} />
        </ChartCard>
        <ChartCard
          title="Reject reasons"
          isEmpty={topRejects.length === 0}
          emptyLabel="No rejected leads"
        >
          <DriversHorizontalBarChart data={topRejects} />
        </ChartCard>
        <ChartCard
          title="Intake (last 30 days)"
          isEmpty={report.intakeByDay.every((row) => row.count === 0)}
          emptyLabel="No intake in the last 30 days"
        >
          <DriversIntakeLineChart data={report.intakeByDay} />
        </ChartCard>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile
          label="Avg days in status"
          value={formatDays(report.efficiency.avgDaysInCurrentStatus)}
          hint="Current stage age"
        />
        <StatTile
          label="Avg to Registered"
          value={formatDays(report.efficiency.avgDaysToRegistered)}
          tone="success"
        />
        <StatTile
          label="Median to Registered"
          value={formatDays(report.efficiency.medianDaysToRegistered)}
          tone="success"
        />
        <StatTile
          label="Avg to Rejected"
          value={formatDays(report.efficiency.avgDaysToRejected)}
          tone="danger"
        />
        <StatTile
          label="Median to Rejected"
          value={formatDays(report.efficiency.medianDaysToRejected)}
          tone="danger"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]">
          <h3 className="ycds-h3 text-[var(--so-text)]">Assignee breakdown</h3>
          <div className={`mt-3 ${tableWrap}`}>
            <table className={tableCls}>
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Assignee</th>
                  <th className="px-3 py-2 text-right font-medium">Total</th>
                  <th className="px-3 py-2 text-right font-medium">Reg.</th>
                  <th className="px-3 py-2 text-right font-medium">Rej.</th>
                  <th className="px-3 py-2 text-right font-medium">Conv.</th>
                </tr>
              </thead>
              <tbody>
                {report.byAssignee.slice(0, 20).map((row) => (
                  <tr key={row.key} className="border-t border-[var(--so-border)]">
                    <td className="px-3 py-2 text-[var(--so-text)]">{row.label}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.total}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.registered}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.rejected}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.conversionPct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-[12px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]">
          <h3 className="ycds-h3 text-[var(--so-text)]">Source & campaigns</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {report.bySource.map((row) => (
                    <tr key={row.key} className="border-t border-[var(--so-border)]">
                      <td className="px-3 py-2 capitalize text-[var(--so-text)]">{row.label}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Campaign</th>
                    <th className="px-3 py-2 text-right font-medium">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {report.byCampaign.length === 0 ? (
                    <tr>
                      <td className="px-3 py-3 text-[var(--so-muted)]" colSpan={2}>
                        No campaigns
                      </td>
                    </tr>
                  ) : (
                    report.byCampaign.map((row) => (
                      <tr key={row.key} className="border-t border-[var(--so-border)]">
                        <td className="max-w-[10rem] truncate px-3 py-2 text-[var(--so-text)]">
                          {row.label}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}
