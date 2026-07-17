"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatSalesStatus } from "@/lib/sales-operation/display";
import { rowsToCsv, type SalesAnalyticsReport } from "@/lib/sales-operation/analytics";
import { SALES_LEAD_STATUSES, type SalesAnalyticsSummary } from "@/lib/sales-operation/types";

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
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
    >
      {label}
    </button>
  );
}

export function SalesAnalyticsView() {
  const t = useTranslations("salesOperation");
  const [summary, setSummary] = useState<SalesAnalyticsSummary | null>(null);
  const [report, setReport] = useState<SalesAnalyticsReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summaryRes, reportRes] = await Promise.all([
          fetch("/api/sales-operation/analytics/summary", { cache: "no-store" }),
          fetch("/api/sales-operation/analytics/report", { cache: "no-store" }),
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
        if (!summaryRes.ok || !summaryData.ok || !summaryData.summary) {
          throw new Error(summaryData.error ?? "Failed to load analytics.");
        }
        if (cancelled) return;
        setSummary(summaryData.summary);
        if (reportRes.ok && reportData.ok) setReport(reportData.report ?? null);
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
    return <p className="crm-page text-sm text-muted">{t("loading")}</p>;
  }

  if (error || !summary) {
    return <p className="crm-page text-sm text-rose-700">{error ?? t("analyticsError")}</p>;
  }

  const maxFunnel = report ? Math.max(1, ...report.funnel.map((step) => step.count)) : 1;
  const maxAging = report ? Math.max(1, ...report.aging.map((bucket) => bucket.count)) : 1;

  return (
    <section className="crm-page space-y-4">
      {report ? (
        <article className="crm-surface rounded-3xl p-4">
          <h3 className="crm-section-title">
            {t("report.dailyTitle")} · {report.daily.date}
          </h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-border bg-white/80 p-3">
              <p className="text-xs text-muted">{t("report.newLeads")}</p>
              <p className="text-2xl font-semibold">{report.daily.newLeads}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/80 p-3">
              <p className="text-xs text-muted">{t("report.movedForward")}</p>
              <p className="text-2xl font-semibold">{report.daily.movedForward}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/80 p-3">
              <p className="text-xs text-muted">{t("report.signedToday")}</p>
              <p className="text-2xl font-semibold text-emerald-700">{report.daily.signed}</p>
            </div>
            <div className="rounded-2xl border border-border bg-white/80 p-3">
              <p className="text-xs text-muted">{t("report.rejectedToday")}</p>
              <p className="text-2xl font-semibold text-rose-700">{report.daily.rejected}</p>
            </div>
          </div>
        </article>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="crm-surface rounded-3xl p-4">
          <p className="crm-label">{t("kpi.totalLeads")}</p>
          <p className="mt-1 text-3xl font-semibold text-slate-900">{summary.leadsTotal}</p>
        </article>
        {SALES_LEAD_STATUSES.map((status) => (
          <article key={status} className="crm-surface rounded-3xl p-4">
            <p className="crm-label">{formatSalesStatus(status)}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{summary.byStatus[status]}</p>
          </article>
        ))}
      </div>

      {report ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <article className="crm-surface rounded-3xl p-4">
            <p className="crm-label">{t("report.winRate")}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{report.winLoss.winRate}%</p>
            <p className="mt-1 text-xs text-muted">
              {report.winLoss.signed} / {report.winLoss.rejected}
            </p>
          </article>
          <article className="crm-surface rounded-3xl p-4">
            <p className="crm-label">{t("report.avgDaysToWin")}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">
              {report.winLoss.avgDaysToWin ?? "—"}
            </p>
          </article>
          <article className="crm-surface rounded-3xl p-4">
            <p className="crm-label">{t("report.weightedPipeline")}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">
              {formatMoney(report.forecast.totalWeighted)}
            </p>
            <p className="mt-1 text-xs text-muted">
              {t("report.ofPotential", { value: formatMoney(report.forecast.totalPotential) })}
            </p>
          </article>
          <article className="crm-surface rounded-3xl p-4">
            <p className="crm-label">{t("report.openDeals")}</p>
            <p className="mt-1 text-3xl font-semibold text-slate-900">{report.winLoss.open}</p>
          </article>
        </div>
      ) : null}

      {report ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <article className="crm-surface rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="crm-section-title mb-0">{t("report.funnelTitle")}</h3>
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
            </div>
            <div className="mt-4 space-y-2">
              {report.funnel.map((step) => (
                <div key={step.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{step.label}</span>
                    <span className="text-muted">
                      {step.count}
                      {step.conversionFromPrev !== null ? ` · ${step.conversionFromPrev}%` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-red-500 to-orange-400"
                      style={{ width: `${Math.max(4, (step.count / maxFunnel) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="crm-surface rounded-3xl p-4">
            <h3 className="crm-section-title">{t("report.agingTitle")}</h3>
            <div className="mt-4 space-y-2">
              {report.aging.map((bucket) => (
                <div key={bucket.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">
                      {t(`report.agingBucket.${bucket.key}`)}
                    </span>
                    <span className="text-muted">{bucket.count}</span>
                  </div>
                  <div className="mt-1 h-3 rounded-full bg-slate-100">
                    <div
                      className="h-3 rounded-full bg-gradient-to-r from-sky-500 to-indigo-400"
                      style={{ width: `${Math.max(4, (bucket.count / maxAging) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            {report.stageAging.length > 0 ? (
              <div className="mt-4 overflow-auto rounded-2xl border border-border/70">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 text-left">{t("report.stage")}</th>
                      <th className="px-3 py-2 text-right">{t("report.openDeals")}</th>
                      <th className="px-3 py-2 text-right">{t("report.avgDays")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {report.stageAging.map((stage) => (
                      <tr key={stage.key}>
                        <td className="px-3 py-2">{stage.label}</td>
                        <td className="px-3 py-2 text-right">{stage.openCount}</td>
                        <td className="px-3 py-2 text-right">{stage.avgDaysInStage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <article className="crm-surface rounded-3xl p-4">
          <h3 className="crm-section-title">{t("chart.byStatus")}</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.leadsByStatusChart}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#ef4444" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>

        <article className="crm-surface rounded-3xl p-4">
          <h3 className="crm-section-title">{t("chart.topCampaigns")}</h3>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.topCampaignsChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="campaignName" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#f97316" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>

      {report ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <article className="crm-surface rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="crm-section-title mb-0">{t("report.bySourceTitle")}</h3>
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
            </div>
            <div className="mt-3 overflow-auto rounded-2xl border border-border/70">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("report.source")}</th>
                    <th className="px-3 py-2 text-right">{t("report.count")}</th>
                    <th className="px-3 py-2 text-right">{t("kpi.signed")}</th>
                    <th className="px-3 py-2 text-right">{t("report.conversion")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {report.bySource.map((row) => (
                    <tr key={row.source}>
                      <td className="px-3 py-2 capitalize">{row.source}</td>
                      <td className="px-3 py-2 text-right">{row.total}</td>
                      <td className="px-3 py-2 text-right">{row.signed}</td>
                      <td className="px-3 py-2 text-right">{row.conversionPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="crm-surface rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <h3 className="crm-section-title mb-0">{t("report.bySegmentTitle")}</h3>
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
            </div>
            <div className="mt-3 overflow-auto rounded-2xl border border-border/70">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("report.segment")}</th>
                    <th className="px-3 py-2 text-right">{t("report.count")}</th>
                    <th className="px-3 py-2 text-right">{t("kpi.signed")}</th>
                    <th className="px-3 py-2 text-right">{t("report.potential")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {report.bySegment.map((row) => (
                    <tr key={row.segmentId ?? "none"}>
                      <td className="px-3 py-2">{row.name}</td>
                      <td className="px-3 py-2 text-right">{row.total}</td>
                      <td className="px-3 py-2 text-right">{row.signed}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.potential)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}

      {report ? (
        <article className="crm-surface rounded-3xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="crm-section-title mb-0">{t("report.forecastTitle")}</h3>
            <ExportButton
              label={t("report.exportCsv")}
              onClick={() =>
                downloadCsv("sales-forecast.csv", [
                  [
                    t("report.month"),
                    t("report.openDeals"),
                    t("report.potential"),
                    t("report.weighted"),
                  ],
                  ...report.forecast.byMonth.map((row) => [
                    row.month ?? t("report.unscheduled"),
                    row.openCount,
                    row.potential,
                    row.weightedValue,
                  ]),
                ])
              }
            />
          </div>
          {report.forecast.byMonth.length === 0 ? (
            <p className="mt-3 text-sm text-muted">{t("report.noForecast")}</p>
          ) : (
            <div className="mt-3 overflow-auto rounded-2xl border border-border/70">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-3 py-2 text-left">{t("report.month")}</th>
                    <th className="px-3 py-2 text-right">{t("report.openDeals")}</th>
                    <th className="px-3 py-2 text-right">{t("report.potential")}</th>
                    <th className="px-3 py-2 text-right">{t("report.weighted")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {report.forecast.byMonth.map((row) => (
                    <tr key={row.month ?? "unscheduled"}>
                      <td className="px-3 py-2">{row.month ?? t("report.unscheduled")}</td>
                      <td className="px-3 py-2 text-right">{row.openCount}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.potential)}</td>
                      <td className="px-3 py-2 text-right">{formatMoney(row.weightedValue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      ) : null}
    </section>
  );
}
