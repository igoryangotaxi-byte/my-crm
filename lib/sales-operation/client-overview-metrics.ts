import { normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import type { YangoSupabaseOrderMetric } from "@/types/crm";

export type SalesClientMetricsSummary = {
  from: string;
  to: string;
  requests: number;
  trips: number;
  gmv: number;
  decoupling: number;
  decouplingRate: number;
};

function getScheduledDateKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function defaultClientMetricsRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 90);
  const fmt = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };
  return { from: fmt(from), to: fmt(to) };
}

export function filterClientYangoRows({
  rows,
  corpClientId,
  from,
  to,
}: {
  rows: YangoSupabaseOrderMetric[];
  corpClientId: string;
  from: string;
  to: string;
}): YangoSupabaseOrderMetric[] {
  const normalized = normalizeCorpClientId(corpClientId);
  return rows.filter((row) => {
    if (normalizeCorpClientId(row.corpClientId) !== normalized) return false;
    const dateKey = getScheduledDateKey(row.scheduledAt);
    return Boolean(dateKey && dateKey >= from && dateKey <= to);
  });
}

export function summarizeClientYangoMetrics(
  rows: YangoSupabaseOrderMetric[],
  from: string,
  to: string,
): SalesClientMetricsSummary {
  let requests = 0;
  let trips = 0;
  let gmv = 0;
  let decoupling = 0;

  for (const row of rows) {
    requests += 1;
    if (row.successOrderFlag === true) trips += 1;
    gmv += row.clientPaid;
    decoupling += row.decoupling;
  }

  return {
    from,
    to,
    requests,
    trips,
    gmv,
    decoupling,
    decouplingRate: gmv > 0 ? (decoupling / gmv) * 100 : 0,
  };
}
