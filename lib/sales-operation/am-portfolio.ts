import {
  CLIENT_HEALTH_STATUSES,
  computeClientHealth,
  type ClientHealthResult,
  type ClientHealthStatus,
} from "@/lib/sales-operation/client-health";
import type { SalesClientListRow } from "@/lib/sales-operation/client-list";

export type PortfolioClientMetrics = {
  trips: number;
  gmv: number;
  decouplingRate: number;
  lastTripAt: string | null;
};

export type AmPortfolioClient = {
  key: string;
  salesClientId: string | null;
  corpClientId: string | null;
  name: string;
  companyName: string | null;
  signedAt: string | null;
  metrics: PortfolioClientMetrics | null;
  health: ClientHealthResult;
};

export type AmPortfolioGroup = {
  accountManagerUserId: string | null;
  accountManagerName: string | null;
  clientCount: number;
  totalGmv: number;
  totalTrips: number;
  atRiskCount: number;
  healthCounts: Record<ClientHealthStatus, number>;
  clients: AmPortfolioClient[];
};

const HEALTH_SEVERITY: Record<ClientHealthStatus, number> = {
  dormant: 0,
  at_risk: 1,
  watch: 2,
  new: 3,
  healthy: 4,
};

const UNASSIGNED_KEY = "__unassigned__";

function emptyHealthCounts(): Record<ClientHealthStatus, number> {
  return CLIENT_HEALTH_STATUSES.reduce(
    (acc, status) => {
      acc[status] = 0;
      return acc;
    },
    {} as Record<ClientHealthStatus, number>,
  );
}

/**
 * Groups signed / B2B clients by account manager and attaches a health verdict
 * to each. Pure — metrics are supplied by the caller (looked up by corp id).
 */
export function buildAmPortfolio(
  rows: SalesClientListRow[],
  metricsByCorpId: Record<string, PortfolioClientMetrics>,
  now: Date = new Date(),
): AmPortfolioGroup[] {
  const groups = new Map<string, AmPortfolioGroup>();

  for (const row of rows) {
    const groupKey = row.accountManagerUserId ?? UNASSIGNED_KEY;
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        accountManagerUserId: row.accountManagerUserId,
        accountManagerName: row.accountManagerName,
        clientCount: 0,
        totalGmv: 0,
        totalTrips: 0,
        atRiskCount: 0,
        healthCounts: emptyHealthCounts(),
        clients: [],
      };
      groups.set(groupKey, group);
    }

    const metrics = row.corpClientId ? metricsByCorpId[row.corpClientId] ?? null : null;
    const health = computeClientHealth({
      trips: metrics?.trips ?? 0,
      gmv: metrics?.gmv ?? 0,
      decouplingRate: metrics?.decouplingRate ?? 0,
      lastTripAt: metrics?.lastTripAt ?? null,
      signedAt: row.signedAt,
      now,
    });

    group.clients.push({
      key: row.key,
      salesClientId: row.salesClientId,
      corpClientId: row.corpClientId,
      name: row.name,
      companyName: row.companyName,
      signedAt: row.signedAt,
      metrics,
      health,
    });
    group.clientCount += 1;
    group.totalGmv += metrics?.gmv ?? 0;
    group.totalTrips += metrics?.trips ?? 0;
    group.healthCounts[health.status] += 1;
    if (health.status === "at_risk" || health.status === "dormant") {
      group.atRiskCount += 1;
    }
  }

  for (const group of groups.values()) {
    group.clients.sort((a, b) => {
      const severity = HEALTH_SEVERITY[a.health.status] - HEALTH_SEVERITY[b.health.status];
      if (severity !== 0) return severity;
      return (b.metrics?.gmv ?? 0) - (a.metrics?.gmv ?? 0);
    });
  }

  return [...groups.values()].sort((a, b) => {
    // Unassigned group always last.
    if (a.accountManagerUserId === null && b.accountManagerUserId !== null) return 1;
    if (b.accountManagerUserId === null && a.accountManagerUserId !== null) return -1;
    return b.totalGmv - a.totalGmv;
  });
}
