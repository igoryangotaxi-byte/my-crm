"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { BarChart3, Download } from "lucide-react";
import { defaultPipelineStages } from "@/lib/sales-operation/display";
import { rowsToCsv, type SalesAnalyticsReport } from "@/lib/sales-operation/analytics";
import type {
  PipelineStage,
  SalesAnalyticsSummary,
  SalesLeadStatus,
} from "@/lib/sales-operation/types";
import { StatTile } from "@/components/ui/StatTile";
import { ChartCard } from "@/components/ui/ChartCard";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

function ChartSkeleton() {
  return <Skeleton className="h-72 w-full rounded-[12px]" />;
}

const StatusBarChart = dynamic(
  () => import("./analytics/SalesAnalyticsCharts").then((m) => m.StatusBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);
const CampaignsBarChart = dynamic(
  () => import("./analytics/SalesAnalyticsCharts").then((m) => m.CampaignsBarChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "ILS",
    maximumFractionDigits: 0,
  }).format(value);
}

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

function ExportButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="so-focus-ring inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--so-border-strong)] bg-[var(--so-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--so-text)] transition-colors hover:bg-[var(--so-surface-hover)]"
    >
      <Download className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

const tableWrap =
  "overflow-auto rounded-[12px] border border-[var(--so-border)]";
const tableHead = "bg-[var(--so-surface-2)] text-[var(--so-muted)]";
const tableCls = "min-w-full text-xs";

function AnalyticsSkeleton() {
  return (
    <section className="crm-page space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-72 w-full rounded-[12px]" />
        </div>
        <div className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="mt-4 h-72 w-full rounded-[12px]" />
        </div>
      </div>
    </section>
  );
}

export function SalesAnalyticsView() {
  const t = useTranslations("salesOperation");
  const [summary, setSummary] = useState<SalesAnalyticsSummary | null>(null);
  const [report, setReport] = useState<SalesAnalyticsReport | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>(() => defaultPipelineStages());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, reportRes, stagesRes] = await Promise.all([
          fetch("/api/sales-operation/analytics/summary", { cache: "no-store" }),
          fetch("/api/sales-operation/analytics/report", { cache: "no-store" }),
          fetch("/api/sales-operation/config/stages", { cache: "no-store" }),
        ]);
        const summaryData = (await summaryRes.json()) as {
          ok?: boolean;
          summary?: SalesAnalyticsSummary;
          error?: string;
        };
        const reportData = (await reportRes.json()) as {
          ok?: boolean;
          report?: SalesAnalyticsReport;
          error?: string;
        };
        const stagesData = (await stagesRes.json()) as {
          ok?: boolean;
          stages?: PipelineStage[];
        };
        if (!summaryRes.ok || !summaryData.ok || !summaryData.summary) {
          throw new Error(summaryData.error ?? "Failed to load analytics.");
        }
        if (cancelled) return;
        setSummary(summaryData.summary);
        if (reportRes.ok && reportData.ok) setReport(reportData.report ?? null);
        if (stagesRes.ok && stagesData.ok && stagesData.stages?.length) {
          setStages(stagesData.stages);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load analytics.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return <AnalyticsSkeleton />;
  }

  if (error || !summary) {
    return (
      <section className="crm-page">
        <div className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4">
          <EmptyState
            icon={<BarChart3 className="h-5 w-5" />}
            title={error ?? t("analyticsError")}
          />
        </div>
      </section>
    );
  }

  const maxFunnel = report ? Math.max(1, ...report.funnel.map((step) => step.count)) : 1;
  const maxAging = report ? Math.max(1, ...report.aging.map((bucket) => bucket.count)) : 1;
  const summaryStages = stages.filter(
    (stage) => stage.isActive || (summary.byStatus[stage.key as SalesLeadStatus] ?? 0) > 0,
  );
  const statusChartData = summaryStages.map((stage) => ({
    status: stage.label,
    count: summary.byStatus[stage.key as SalesLeadStatus] ?? 0,
  }));

  return (
    <section className="crm-page space-y-4">
      {report ? (
        <article className="rounded-[16px] border border-[var(--so-border)] bg-[var(--so-surface)] p-4 shadow-[var(--so-shadow-sm)]">
          <h3 className="text-[0.95rem] font-bold tracking-tight text-[var(--so-text)]">
            {t("report.dailyTitle")} · {report.daily.date}
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <StatTile label={t("report.newLeads")} value={report.daily.newLeads} />
            <StatTile label={t("report.movedForward")} value={report.daily.movedForward} />
            <StatTile label={t("report.signedToday")} value={report.daily.signed} tone="success" />
            <StatTile label={t("report.rejectedToday")} value={report.daily.rejected} tone="danger" />
          </div>
        </article>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("kpi.totalLeads")} value={summary.leadsTotal} tone="accent" />
        {summaryStages.map((stage) => (
          <StatTile
            key={stage.key}
            label={stage.label}
            value={summary.byStatus[stage.key as SalesLeadStatus] ?? 0}
          />
        ))}
      </div>

      {report ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label={t("report.winRate")}
            value={`${report.winLoss.winRate}%`}
            hint={`${report.winLoss.signed} / ${report.winLoss.rejected}`}
          />
          <StatTile label={t("report.avgDaysToWin")} value={report.winLoss.avgDaysToWin ?? "—"} />
          <StatTile
            label={t("report.weightedPipeline")}
            value={formatMoney(report.forecast.totalWeighted)}
            hint={t("report.ofPotential", { value: formatMoney(report.forecast.totalPotential) })}
          />
          <StatTile label={t("report.openDeals")} value={report.winLoss.open} />
        </div>
      ) : null}

      {report ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title={t("report.funnelTitle")}
            action={
              <ExportButton
                label={t("report.exportCsv")}
                onClick={() =>
                  downloadCsv("sales-funnel.csv", [
                    [t("report.stage"), t("report.count"), t("report.conversion")],
                    ...report.funnel.map((step) => [
                      step.label,
                      step.count,
                      step.conversionFromPrev === null ? "" : `${step.conversionFromPrev}%`,
                    ]),
                  ])
                }
              />
            }
          >
            <div className="space-y-2.5">
              {report.funnel.map((step) => (
                <div key={step.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--so-text)]">{step.label}</span>
                    <span className="text-[var(--so-muted)]">
                      {step.count}
                      {step.conversionFromPrev !== null ? ` · ${step.conversionFromPrev}%` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--so-border)]">
                    <div
                      className="h-full rounded-full bg-[var(--so-accent)] transition-[width] duration-500"
                      style={{ width: `${Math.max(4, (step.count / maxFunnel) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </ChartCard>

          <ChartCard title={t("report.agingTitle")}>
            <div className="space-y-2.5">
              {report.aging.map((bucket) => (
                <div key={bucket.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--so-text)]">
                      {t(`report.agingBucket.${bucket.key}`)}
                    </span>
                    <span className="text-[var(--so-muted)]">{bucket.count}</span>
                  </div>
                  <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[var(--so-border)]">
                    <div
                      className="h-full rounded-full bg-sky-500 transition-[width] duration-500"
                      style={{ width: `${Math.max(4, (bucket.count / maxAging) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {report.stageAging.length > 0 ? (
              <div className={`mt-4 ${tableWrap}`}>
                <table className={tableCls}>
                  <thead className={tableHead}>
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">{t("report.stage")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("report.openDeals")}</th>
                      <th className="px-3 py-2 text-right font-semibold">{t("report.avgDays")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--so-border)]">
                    {report.stageAging.map((stage) => (
                      <tr key={stage.key} className="transition-colors hover:bg-[var(--so-surface-hover)]">
                        <td className="px-3 py-2">{stage.label}</td>
                        <td className="px-3 py-2 text-right">{stage.openCount}</td>
                        <td className="px-3 py-2 text-right">{stage.avgDaysInStage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </ChartCard>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title={t("chart.byStatus")}
          isEmpty={statusChartData.length === 0}
          emptyIcon={<BarChart3 className="h-5 w-5" />}
        >
          <StatusBarChart data={statusChartData} />
        </ChartCard>

        <ChartCard
          title={t("chart.topCampaigns")}
          isEmpty={summary.topCampaignsChart.length === 0}
          emptyIcon={<BarChart3 className="h-5 w-5" />}
        >
          <CampaignsBarChart data={summary.topCampaignsChart} />
        </ChartCard>
      </div>

      {report ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <ChartCard
            title={t("report.bySourceTitle")}
            action={
              <ExportButton
                label={t("report.exportCsv")}
                onClick={() =>
                  downloadCsv("sales-by-source.csv", [
                    [t("report.source"), t("report.count"), t("kpi.signed"), t("report.conversion")],
                    ...report.bySource.map((row) => [
                      row.source,
                      row.total,
                      row.signed,
                      `${row.conversionPct}%`,
                    ]),
                  ])
                }
              />
            }
          >
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t("report.source")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("report.count")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("kpi.signed")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("report.conversion")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--so-border)]">
                  {report.bySource.map((row) => (
                    <tr key={row.source} className="transition-colors hover:bg-[var(--so-surface-hover)]">
                      <td className="px-3 py-2 capitalize">{row.source}</td>
                      <td className="px-3 py-2 text-right">{row.total}</td>
                      <td className="px-3 py-2 text-right">{row.signed}</td>
                      <td className="px-3 py-2 text-right">{row.conversionPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard
            title={t("report.bySegmentTitle")}
            action={
              <ExportButton
                label={t("report.exportCsv")}
                onClick={() =>
                  downloadCsv("sales-by-segment.csv", [
                    [
                      t("report.segment"),
                      t("report.count"),
                      t("kpi.signed"),
                      t("report.potential"),
                      t("report.weighted"),
                    ],
                    ...report.bySegment.map((row) => [
                      row.name,
                      row.total,
                      row.signed,
                      row.potential,
                      row.weightedValue,
                    ]),
                  ])
                }
              />
            }
          >
            <div className={tableWrap}>
              <table className={tableCls}>
                <thead className={tableHead}>
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">{t("report.segment")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("report.count")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("kpi.signed")}</th>
                    <th className="px-3 py-2 text-right font-semibold">{t("report.potential")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--so-border)]">
                  {report.bySegment.map((row) => (
                    <tr
                      key={row.segmentId ?? "none"}
                      className="transition-colors hover:bg-[var(--so-surface-hover)]"
                    >
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-right">{row.total}</td>
                      <td className="px-3 py-2 text-right">{row.signed}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.potential)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </div>
      ) : null}

      {report ? (
        <ChartCard
          title={t("report.forecastTitle")}
          action={
            <ExportButton
              label={t("report.exportCsv")}
              onClick={() =>
                downloadCsv("sales-forecast.csv", [
                  [t("report.month"), t("report.openDeals"), t("report.potential"), t("report.weighted")],
                  ...report.forecast.byMonth.map((row) => [
                    row.month ?? t("report.unscheduled"),
                    row.openCount,
                    row.potential,
                    row.weightedValue,
                  ]),
                ])
              }
            />
          }
          isEmpty={report.forecast.byMonth.length === 0}
          emptyLabel={t("report.noForecast")}
        >
          <div className={tableWrap}>
            <table className={tableCls}>
              <thead className={tableHead}>
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">{t("report.month")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("report.openDeals")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("report.potential")}</th>
                  <th className="px-3 py-2 text-right font-semibold">{t("report.weighted")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--so-border)]">
                {report.forecast.byMonth.map((row) => (
                  <tr
                    key={row.month ?? "unscheduled"}
                    className="transition-colors hover:bg-[var(--so-surface-hover)]"
                  >
                    <td className="px-3 py-2">{row.month ?? t("report.unscheduled")}</td>
                    <td className="px-3 py-2 text-right">{row.openCount}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.potential)}</td>
                    <td className="px-3 py-2 text-right">{formatMoney(row.weightedValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      ) : null}
    </section>
  );
}
