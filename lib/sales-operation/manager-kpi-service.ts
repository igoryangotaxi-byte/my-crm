import { getSupabaseAdminClient } from "@/lib/supabase";
import { loadAuthStore } from "@/lib/auth-store";
import { listB2BClientRegistry, normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import { listPipelineStages } from "@/lib/sales-operation/pipeline-config";
import { listSalesLeads } from "@/lib/sales-operation/repository";
import { getYangoSupabaseOrderMetricsForRange } from "@/lib/yango-supabase";
import {
  buildManagerKpis,
  type KpiActivity,
  type KpiCompletedTask,
  type KpiStatusEvent,
  type ManagerGmvTrips,
  type ManagerKpiRow,
} from "@/lib/sales-operation/manager-kpi";

export type ManagerKpiReport = {
  from: string;
  to: string;
  rows: ManagerKpiRow[];
};

function toDateKey(iso: string): string | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function loadGmvTripsByManager(from: string, to: string): Promise<Record<string, ManagerGmvTrips>> {
  const registry = await listB2BClientRegistry();
  if (registry.length === 0) return {};

  const rows = await getYangoSupabaseOrderMetricsForRange({
    since: `${from}T00:00:00.000Z`,
    till: `${to}T23:59:59.999Z`,
  });

  const byCorp = new Map<string, ManagerGmvTrips>();
  for (const row of rows) {
    const corpId = normalizeCorpClientId(row.corpClientId);
    if (!corpId) continue;
    const dateKey = toDateKey(row.scheduledAt);
    if (!dateKey || dateKey < from || dateKey > to) continue;
    const acc = byCorp.get(corpId) ?? { gmv: 0, trips: 0 };
    acc.gmv += row.clientPaid;
    if (row.successOrderFlag === true) acc.trips += 1;
    byCorp.set(corpId, acc);
  }

  const byManager: Record<string, ManagerGmvTrips> = {};
  for (const entry of registry) {
    const corpTotals = byCorp.get(normalizeCorpClientId(entry.corpClientId));
    if (!corpTotals) continue;
    const managerIds = new Set<string>();
    if (entry.accountManager.userId) managerIds.add(entry.accountManager.userId);
    if (entry.salesManager.userId) managerIds.add(entry.salesManager.userId);
    for (const managerId of managerIds) {
      const acc = byManager[managerId] ?? { gmv: 0, trips: 0 };
      acc.gmv += corpTotals.gmv;
      acc.trips += corpTotals.trips;
      byManager[managerId] = acc;
    }
  }
  return byManager;
}

export async function getManagerKpiReport({
  from,
  to,
  managerUserId,
}: {
  from: string;
  to: string;
  managerUserId?: string | null;
}): Promise<ManagerKpiReport> {
  const supabase = getSupabaseAdminClient();
  const startIso = `${from}T00:00:00.000Z`;
  const endIso = `${to}T23:59:59.999Z`;

  const [leads, stages, store, gmvTripsByManager, statusRes, activityRes, taskRes] = await Promise.all([
    listSalesLeads(),
    listPipelineStages(),
    loadAuthStore(),
    loadGmvTripsByManager(from, to),
    supabase
      .from("sales_lead_status_events")
      .select("lead_id, from_status, to_status, changed_by_user_id, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso),
    supabase
      .from("sales_activities")
      .select("lead_id, actor_user_id, occurred_at")
      .gte("occurred_at", startIso)
      .lte("occurred_at", endIso),
    supabase
      .from("sales_tasks")
      .select("lead_id, completed_by_user_id, completed_at, status")
      .eq("status", "done")
      .gte("completed_at", startIso)
      .lte("completed_at", endIso),
  ]);

  const statusEvents: KpiStatusEvent[] = ((statusRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      leadId: String(row.lead_id),
      fromStatus: (row.from_status as string | null) ?? null,
      toStatus: String(row.to_status ?? ""),
      changedByUserId: (row.changed_by_user_id as string | null) ?? null,
      createdAt: String(row.created_at),
    }),
  );
  const activities: KpiActivity[] = ((activityRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      leadId: String(row.lead_id),
      actorUserId: (row.actor_user_id as string | null) ?? null,
      occurredAt: String(row.occurred_at),
    }),
  );
  const completedTasks: KpiCompletedTask[] = ((taskRes.data ?? []) as Record<string, unknown>[]).map(
    (row) => ({
      leadId: String(row.lead_id),
      completedByUserId: (row.completed_by_user_id as string | null) ?? null,
      completedAt: (row.completed_at as string | null) ?? null,
      status: String(row.status ?? ""),
    }),
  );

  // Managers relevant to this report: lead owners + registry managers.
  const relevant = new Set<string>();
  for (const lead of leads) {
    if (lead.assignedManagerUserId) relevant.add(lead.assignedManagerUserId);
  }
  for (const id of Object.keys(gmvTripsByManager)) relevant.add(id);

  const managers = store.users.map((user) => ({ userId: user.id, name: user.name }));

  let rows = buildManagerKpis({
    leads,
    stages,
    statusEvents,
    activities,
    completedTasks,
    gmvTripsByManager,
    managers,
    periodStart: startIso,
    periodEnd: endIso,
  });

  // Keep rows for relevant managers or anyone with a non-zero actual.
  rows = rows.filter(
    (row) =>
      relevant.has(row.managerUserId) ||
      Object.values(row.actuals).some((value) => value !== 0),
  );

  if (managerUserId) {
    rows = rows.filter((row) => row.managerUserId === managerUserId);
  }

  return { from, to, rows };
}
