import {
  getManagersByCorpClientIds,
  listB2BClientRegistry,
  normalizeCorpClientId,
} from "@/lib/sales-operation/b2b-client-registry";
import type { ManagerPortfolioSummary } from "@/lib/sales-operation/manager-types";
import { getYangoSupabaseOrderMetricsForRange } from "@/lib/yango-supabase";
import { loadAuthStore } from "@/lib/auth-store";

type ManagerRole = "account" | "sales";

function getScheduledDateKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export async function getManagerPortfolioSummary({
  managerUserId,
  role,
  from,
  to,
}: {
  managerUserId: string;
  role: ManagerRole;
  from: string;
  to: string;
}): Promise<ManagerPortfolioSummary> {
  const store = await loadAuthStore();
  const manager = store.users.find((user) => user.id === managerUserId);
  const managerName = manager?.name ?? managerUserId;

  const registry = await listB2BClientRegistry();
  const portfolioClients = registry.filter((entry) => {
    const assignment = role === "account" ? entry.accountManager : entry.salesManager;
    return assignment.userId === managerUserId;
  });

  const corpClientIds = portfolioClients.map((entry) => entry.corpClientId);
  const rows =
    corpClientIds.length === 0
      ? []
      : await getYangoSupabaseOrderMetricsForRange({
          since: `${from}T00:00:00.000Z`,
          till: `${to}T23:59:59.999Z`,
        });

  const filteredRows = rows.filter((row) => {
    const corpId = normalizeCorpClientId(row.corpClientId);
    if (!corpClientIds.includes(corpId)) return false;
    const dateKey = getScheduledDateKey(row.scheduledAt);
    return Boolean(dateKey && dateKey >= from && dateKey <= to);
  });

  const byClient = new Map<
    string,
    { requests: number; trips: number; gmv: number; decoupling: number; clientName: string }
  >();

  for (const entry of portfolioClients) {
    byClient.set(entry.corpClientId, {
      requests: 0,
      trips: 0,
      gmv: 0,
      decoupling: 0,
      clientName: entry.clientName,
    });
  }

  for (const row of filteredRows) {
    const corpId = normalizeCorpClientId(row.corpClientId);
    const acc = byClient.get(corpId);
    if (!acc) continue;
    acc.requests += 1;
    if (row.successOrderFlag === true) acc.trips += 1;
    acc.gmv += row.clientPaid;
    acc.decoupling += row.decoupling;
  }

  const clients = [...byClient.entries()]
    .map(([corpClientId, value]) => ({
      corpClientId,
      clientName: value.clientName,
      requests: value.requests,
      trips: value.trips,
      gmv: value.gmv,
      decoupling: value.decoupling,
      decouplingRate: value.gmv > 0 ? (value.decoupling / value.gmv) * 100 : 0,
    }))
    .sort((a, b) => b.gmv - a.gmv);

  const totals = clients.reduce(
    (acc, row) => {
      acc.requests += row.requests;
      acc.trips += row.trips;
      acc.gmv += row.gmv;
      acc.decoupling += row.decoupling;
      return acc;
    },
    { requests: 0, trips: 0, gmv: 0, decoupling: 0 },
  );

  return {
    role,
    managerUserId,
    managerName,
    from,
    to,
    clientCount: clients.length,
    requests: totals.requests,
    trips: totals.trips,
    gmv: totals.gmv,
    decoupling: totals.decoupling,
    decouplingRate: totals.gmv > 0 ? (totals.decoupling / totals.gmv) * 100 : 0,
    clients,
  };
}

export async function getRegistryMapForCorpIds(corpClientIds: string[]) {
  return getManagersByCorpClientIds(corpClientIds);
}
