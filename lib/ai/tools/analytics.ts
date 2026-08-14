import { getSalesAnalyticsReport, getSalesAnalyticsSummary, listSalesLeads } from "@/lib/sales-operation/repository";
import { getManagerKpiReport } from "@/lib/sales-operation/manager-kpi-service";
import { getManagerPortfolioSummary } from "@/lib/sales-operation/manager-analytics";
import { listSalesTasksWithLead } from "@/lib/sales-operation/tasks";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

function defaultRange() {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 3600 * 1000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function analyticsQueryMetric(run: ToolRun): Promise<AiToolResult> {
  const metric = String(run.args.metric ?? "leads_total");
  const range = {
    from: String(run.args.from ?? defaultRange().from).slice(0, 10),
    to: String(run.args.to ?? defaultRange().to).slice(0, 10),
  };
  if (metric === "kpi") {
    const report = await getManagerKpiReport(range);
    return {
      ok: true,
      data: report,
      uiBlocks: [
        {
          type: "metric",
          title: "Manager KPIs",
          fact: `KPI report for ${range.from} → ${range.to}.`,
        },
      ],
    };
  }
  if (metric === "portfolio") {
    const portfolio = await getManagerPortfolioSummary({
      managerUserId: run.userId,
      role: "sales",
      from: range.from,
      to: range.to,
    });
    return { ok: true, data: portfolio };
  }
  const summary = await getSalesAnalyticsSummary();
  if (metric === "signed_conversion") {
    return {
      ok: true,
      data: { signedConversionPct: summary.signedConversionPct, leadsTotal: summary.leadsTotal },
      uiBlocks: [
        {
          type: "metric",
          title: "Signed conversion",
          fact: `${summary.signedConversionPct.toFixed(1)}% of ${summary.leadsTotal} leads are signed.`,
        },
      ],
    };
  }
  if (metric === "by_status") return { ok: true, data: summary.byStatus };
  if (metric === "top_campaigns") return { ok: true, data: summary.topCampaigns };
  return {
    ok: true,
    data: summary,
    uiBlocks: [
      {
        type: "metric",
        title: "Leads",
        fact: `${summary.leadsTotal} leads in the pipeline. Signed conversion ${summary.signedConversionPct.toFixed(1)}%.`,
      },
    ],
  };
}

export async function analyticsCompare(run: ToolRun): Promise<AiToolResult> {
  const left = String(run.args.left ?? "").trim();
  const right = String(run.args.right ?? "").trim();
  const summary = await getSalesAnalyticsSummary();
  const find = (name: string) =>
    summary.topCampaigns.find((row) => row.campaignName.toLowerCase().includes(name.toLowerCase()));
  const a = find(left);
  const b = find(right);
  if (!a || !b) {
    return {
      ok: true,
      data: { left: a ?? null, right: b ?? null, campaigns: summary.topCampaigns },
      uiBlocks: [
        {
          type: "metric",
          title: "Campaign compare",
          fact: "At least one campaign was not in the top campaign list.",
          inference: "Only top campaigns by lead volume are available in this metric.",
        },
      ],
    };
  }
  const delta = a.count - b.count;
  return {
    ok: true,
    data: { left: a, right: b, leadDelta: delta },
    uiBlocks: [
      {
        type: "metric",
        title: `${a.campaignName} vs ${b.campaignName}`,
        fact: `${a.campaignName}: ${a.count} leads. ${b.campaignName}: ${b.count} leads.`,
        inference: `${a.campaignName} has ${Math.abs(delta)} ${delta >= 0 ? "more" : "fewer"} leads in the tracked set.`,
        recommendation: delta > 0 ? `Review why ${b.campaignName} trails on volume.` : undefined,
      },
    ],
  };
}

export async function analyticsTimeseries(run: ToolRun): Promise<AiToolResult> {
  const weeks = Math.min(16, Math.max(4, Number(run.args.weeks ?? 8) || 8));
  const leads = await listSalesLeads();
  const buckets = new Map<string, number>();
  const now = Date.now();
  for (let i = 0; i < weeks; i++) {
    const start = new Date(now - i * 7 * 24 * 3600 * 1000);
    const key = start.toISOString().slice(0, 10);
    buckets.set(key, 0);
  }
  for (const lead of leads) {
    const created = new Date(lead.createdAt).getTime();
    if (now - created > weeks * 7 * 24 * 3600 * 1000) continue;
    const weekStart = new Date(created);
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
    const key = weekStart.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const series = [...buckets.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week));
  return { ok: true, data: series };
}

export async function analyticsBreakdown(run: ToolRun): Promise<AiToolResult> {
  const dimension = String(run.args.dimension ?? "status");
  const leads = await listSalesLeads();
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const key =
      dimension === "source"
        ? lead.source || "unknown"
        : dimension === "campaign"
          ? lead.campaignName || "Unassigned"
          : lead.status;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  return { ok: true, data: rows };
}

export async function analyticsDetectAnomaly(_run: ToolRun): Promise<AiToolResult> {
  const [summary, report, overdue] = await Promise.all([
    getSalesAnalyticsSummary(),
    getSalesAnalyticsReport().catch(() => null),
    listSalesTasksWithLead({ statuses: ["open"] }),
  ]);
  const now = Date.now();
  const overdueCount = overdue.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now).length;
  const findings: string[] = [];
  if (overdueCount >= 5) findings.push(`${overdueCount} open tasks are overdue.`);
  if (summary.leadsTotal === 0) findings.push("Pipeline currently has 0 leads.");
  const top = summary.topCampaigns[0];
  if (top && summary.leadsTotal > 0 && top.count / summary.leadsTotal > 0.4) {
    findings.push(`Campaign “${top.campaignName}” accounts for ${Math.round((top.count / summary.leadsTotal) * 100)}% of leads.`);
  }
  return {
    ok: true,
    data: { findings, summary, reportPresent: Boolean(report) },
    uiBlocks: findings.map((fact) => ({
      type: "metric" as const,
      title: "Detector",
      fact,
    })),
  };
}
