import { listActiveOverviewB2BClients } from "@/lib/sales-operation/active-b2b-clients";
import {
  buildAmPortfolio,
  type AmPortfolioGroup,
  type PortfolioClientMetrics,
} from "@/lib/sales-operation/am-portfolio";
import { listB2BClientRegistry, normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import { buildSalesClientListRows } from "@/lib/sales-operation/client-list";
import { defaultClientMetricsRange } from "@/lib/sales-operation/client-overview-metrics";
import { listSalesClients } from "@/lib/sales-operation/repository";
import { getYangoSupabaseOrderMetricsForRange } from "@/lib/yango-supabase";

function getScheduledDateKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getAmPortfolio({
  from,
  to,
}: {
  from?: string;
  to?: string;
} = {}): Promise<{ from: string; to: string; groups: AmPortfolioGroup[] }> {
  const range = defaultClientMetricsRange();
  const fromDate = from?.trim() || range.from;
  const toDate = to?.trim() || range.to;

  const [clients, registry] = await Promise.all([listSalesClients(), listB2BClientRegistry()]);
  const nameByCorpId = Object.fromEntries(
    registry.map((entry) => [entry.corpClientId, entry.clientName]),
  );
  const overviewClients = await listActiveOverviewB2BClients(nameByCorpId);
  const rows = buildSalesClientListRows(clients, registry, overviewClients);

  const metricRows = await getYangoSupabaseOrderMetricsForRange({
    since: `${fromDate}T00:00:00.000Z`,
    till: `${toDate}T23:59:59.999Z`,
  });

  const agg = new Map<
    string,
    { trips: number; gmv: number; decoupling: number; lastTripAt: string | null }
  >();
  for (const row of metricRows) {
    const dateKey = getScheduledDateKey(row.scheduledAt);
    if (!dateKey || dateKey < fromDate || dateKey > toDate) continue;
    const id = normalizeCorpClientId(row.corpClientId);
    if (!id) continue;
    let acc = agg.get(id);
    if (!acc) {
      acc = { trips: 0, gmv: 0, decoupling: 0, lastTripAt: null };
      agg.set(id, acc);
    }
    acc.gmv += row.clientPaid;
    acc.decoupling += row.decoupling;
    if (row.successOrderFlag === true) {
      acc.trips += 1;
      if (!acc.lastTripAt || new Date(row.scheduledAt) > new Date(acc.lastTripAt)) {
        acc.lastTripAt = row.scheduledAt;
      }
    }
  }

  const metricsByCorpId: Record<string, PortfolioClientMetrics> = {};
  for (const [id, value] of agg) {
    metricsByCorpId[id] = {
      trips: value.trips,
      gmv: value.gmv,
      decouplingRate: value.gmv > 0 ? (value.decoupling / value.gmv) * 100 : 0,
      lastTripAt: value.lastTripAt,
    };
  }

  const groups = buildAmPortfolio(rows, metricsByCorpId);
  return { from: fromDate, to: toDate, groups };
}
