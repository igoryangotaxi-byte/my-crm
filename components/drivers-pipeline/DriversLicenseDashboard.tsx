"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { ShieldCheck } from "lucide-react";
import type { DriverLicenseAnalyticsReport } from "@/lib/drivers-pipeline/analytics";
import { rowsToCsv } from "@/lib/sales-operation/analytics";
import { StatTile } from "@/components/ui/StatTile";
import { ChartCard } from "@/components/ui/ChartCard";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

function ChartSkeleton() {
  return <Skeleton className="h-72 w-full rounded-[12px]" />;
}

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

export function DriversLicenseDashboard() {
  const [report, setReport] = useState<DriverLicenseAnalyticsReport | null>(null);
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
        license?: DriverLicenseAnalyticsReport;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.license) {
        throw new Error(json.error ?? "Failed to load license analytics.");
      }
      setReport(json.license);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load license analytics.");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(dateFrom, dateTo);
  }, [load, dateFrom, dateTo]);

  if (loading && !report) {
    return (
      <section className="crm-page space-y-4 p-4 sm:px-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </section>
    );
  }

  if (error && !report) {
    return (
      <section className="crm-page p-4 sm:px-5">
        <EmptyState icon={<ShieldCheck className="h-5 w-5" />} title={error} />
      </section>
    );
  }

  if (!report) return null;

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
            {loading ? "Refreshing…" : `${report.filteredTotal.toLocaleString()} leads`}
          </p>
          <Button
            variant="secondary"
            className="h-9"
            onClick={() => {
              downloadCsv("drivers-taxi-license.csv", [
                ["Bucket", "Count"],
                ...report.byBucket.map((row) => [row.label, row.count]),
              ]);
            }}
          >
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total" value={report.kpis.total.toLocaleString()} />
        <StatTile
          label="With license"
          value={report.kpis.withLicense.toLocaleString()}
          tone="success"
        />
        <StatTile
          label="Without license"
          value={report.kpis.withoutLicense.toLocaleString()}
          tone="danger"
        />
        <StatTile label="Unknown" value={report.kpis.unknown.toLocaleString()} />
        <StatTile
          label="Without %"
          value={`${report.kpis.withoutPct}%`}
          hint="Share of all leads in range"
          tone="accent"
        />
      </div>

      <ChartCard
        title="With vs Without license"
        isEmpty={report.byBucket.every((row) => row.count === 0)}
        emptyLabel="No leads in range"
      >
        <DriversLicenseMixChart data={report.byBucket} />
        <ul className="mt-3 flex flex-wrap gap-3 text-xs text-[var(--so-muted)]">
          {report.byBucket.map((row) => (
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

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Without license by source"
          isEmpty={report.withoutBySource.length === 0}
          emptyLabel="No without-license leads"
        >
          <DriversHorizontalBarChart
            data={report.withoutBySource.map((row) => ({
              label: row.label,
              count: row.count,
            }))}
          />
        </ChartCard>
        <ChartCard
          title="Without license — campaigns"
          isEmpty={report.withoutByCampaign.length === 0}
          emptyLabel="No campaigns"
        >
          <DriversHorizontalBarChart
            data={report.withoutByCampaign.map((row) => ({
              label: row.label,
              count: row.count,
            }))}
          />
        </ChartCard>
        <ChartCard title="With license intake (30d)">
          <DriversIntakeLineChart data={report.withByDay} />
        </ChartCard>
        <ChartCard title="Without license intake (30d)">
          <DriversIntakeLineChart data={report.withoutByDay} />
        </ChartCard>
      </div>
    </section>
  );
}
