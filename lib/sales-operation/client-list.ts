import { normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import type { B2BClientRegistryEntry } from "@/lib/sales-operation/manager-types";
import type { SalesClient } from "@/lib/sales-operation/types";

export type SalesClientListRow = {
  key: string;
  salesClientId: string | null;
  corpClientId: string | null;
  name: string;
  companyName: string | null;
  accountManagerUserId: string | null;
  accountManagerName: string | null;
  salesManagerName: string | null;
  campaignName: string | null;
  signedAt: string | null;
  /** b2b = overview only; linked = overview + signed; signed = pipeline client without B2B link */
  source: "b2b" | "linked" | "signed";
};

export type OverviewB2BClient = {
  corpClientId: string;
  clientName: string;
};

/** Unique B2B clients that appear in B2B Client Overview metrics. */
export function buildOverviewB2BClients(
  metricsRows: Array<{ corpClientId?: string | null; clientName?: string | null }>,
  corpClientNameMap: Record<string, string> = {},
): OverviewB2BClient[] {
  const byId = new Map<string, string>();
  for (const row of metricsRows) {
    const id = normalizeCorpClientId(row.corpClientId);
    if (!id) continue;
    const mapped = corpClientNameMap[id]?.trim();
    const fromRow = row.clientName?.trim();
    const existing = byId.get(id);
    const next =
      (mapped && mapped.length > 0 ? mapped : null) ||
      (fromRow && fromRow !== id ? fromRow : null) ||
      existing ||
      id;
    if (!existing || existing === id) {
      byId.set(id, next);
    }
  }
  return [...byId.entries()]
    .map(([corpClientId, clientName]) => ({ corpClientId, clientName }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" }));
}

export function buildSalesClientListRows(
  salesClients: SalesClient[],
  registry: B2BClientRegistryEntry[],
  overviewClients: OverviewB2BClient[],
): SalesClientListRow[] {
  const salesByCorpId = new Map<string, SalesClient>();
  const unlinkedSales: SalesClient[] = [];

  for (const client of salesClients) {
    if (client.corpClientId) {
      salesByCorpId.set(normalizeCorpClientId(client.corpClientId), client);
    } else {
      unlinkedSales.push(client);
    }
  }

  const registryByCorpId = new Map(
    registry.map((entry) => [normalizeCorpClientId(entry.corpClientId), entry]),
  );

  const rows: SalesClientListRow[] = overviewClients.map((overview) => {
    const corpClientId = normalizeCorpClientId(overview.corpClientId);
    const entry = registryByCorpId.get(corpClientId) ?? null;
    const linked = salesByCorpId.get(corpClientId) ?? null;
    const dbName =
      entry?.clientName?.trim() ||
      overview.clientName?.trim() ||
      corpClientId;
    return {
      key: `b2b:${corpClientId}`,
      salesClientId: linked?.id ?? null,
      corpClientId,
      // Once present in B2B overview / DB map, show the DB/overview client name.
      name: dbName,
      companyName: linked?.companyName ?? dbName,
      accountManagerUserId:
        entry?.accountManager.userId ?? linked?.accountManagerUserId ?? null,
      accountManagerName: entry?.accountManager.name ?? linked?.accountManagerName ?? null,
      salesManagerName:
        entry?.salesManager.name ??
        linked?.salesManagerName ??
        linked?.pendingSalesManagerName ??
        null,
      campaignName: linked?.campaignName ?? null,
      signedAt: linked?.signedAt ?? null,
      source: linked ? "linked" : "b2b",
    };
  });

  for (const client of unlinkedSales) {
    rows.push({
      key: `sales:${client.id}`,
      salesClientId: client.id,
      corpClientId: null,
      // Until linked to B2B, keep the pipeline / signed lead name.
      name: client.fullName,
      companyName: client.companyName,
      accountManagerUserId: client.accountManagerUserId,
      accountManagerName: client.accountManagerName,
      salesManagerName: client.salesManagerName ?? client.pendingSalesManagerName,
      campaignName: client.campaignName,
      signedAt: client.signedAt,
      source: "signed",
    });
  }

  // Pipeline clients linked to a corp that is not in the active overview still belong in Clients.
  for (const [corpClientId, client] of salesByCorpId) {
    if (rows.some((row) => row.corpClientId === corpClientId)) continue;
    const entry = registryByCorpId.get(corpClientId) ?? null;
    const dbName = entry?.clientName?.trim() || client.companyName?.trim() || client.fullName;
    rows.push({
      key: `sales:${client.id}`,
      salesClientId: client.id,
      corpClientId,
      name: dbName,
      companyName: client.companyName ?? dbName,
      accountManagerUserId:
        entry?.accountManager.userId ?? client.accountManagerUserId ?? null,
      accountManagerName: entry?.accountManager.name ?? client.accountManagerName ?? null,
      salesManagerName:
        entry?.salesManager.name ??
        client.salesManagerName ??
        client.pendingSalesManagerName ??
        null,
      campaignName: client.campaignName,
      signedAt: client.signedAt,
      source: "linked",
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return rows;
}

export function filterSalesClientListRows(
  rows: SalesClientListRow[],
  query: string,
): SalesClientListRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => {
    const haystack = [
      row.name,
      row.companyName,
      row.corpClientId,
      row.salesClientId,
      row.accountManagerName,
      row.salesManagerName,
      row.campaignName,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  });
}
