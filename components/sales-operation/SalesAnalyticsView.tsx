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
import { SALES_LEAD_STATUSES, type SalesAnalyticsSummary } from "@/lib/sales-operation/types";

export function SalesAnalyticsView() {
  const t = useTranslations("salesOperation");
  const [summary, setSummary] = useState<SalesAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/sales-operation/analytics/summary", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json()) as {
          ok?: boolean;
          summary?: SalesAnalyticsSummary;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.summary) {
          throw new Error(data.error ?? "Failed to load analytics.");
        }
        setSummary(data.summary);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load analytics."))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="crm-page text-sm text-muted">{t("loading")}</p>;
  }

  if (error || !summary) {
    return <p className="crm-page text-sm text-rose-700">{error ?? t("analyticsError")}</p>;
  }

  return (
    <section className="crm-page space-y-4">
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

      <article className="crm-surface rounded-3xl p-4">
        <p className="crm-label">{t("kpi.conversion")}</p>
        <p className="mt-1 text-3xl font-semibold text-slate-900">
          {summary.signedConversionPct.toFixed(1)}%
        </p>
        <p className="mt-1 text-sm text-muted">{t("kpi.conversionHint")}</p>
      </article>

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
                <YAxis
                  type="category"
                  dataKey="campaignName"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="count" fill="#f97316" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </div>
    </section>
  );
}
