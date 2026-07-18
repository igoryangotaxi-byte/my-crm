import { computeWeightedPipelineValue } from "@/lib/sales-operation/display";
import type { PipelineStage, SalesLead } from "@/lib/sales-operation/types";

/**
 * Per-manager sales KPI actuals, computed from existing data only
 * (pipeline leads + status events + activities/tasks + B2B Overview GMV/trips).
 * Pure and additive: nothing here mutates or depends on new tables.
 */
export const SALES_KPI_METRICS = [
  "signed_count",
  "conversion_pct",
  "leads_worked",
  "activities_logged",
  "tasks_completed",
  "avg_cycle_days",
  "avg_response_hours",
  "weighted_forecast",
  "gmv",
  "trips",
] as const;

export type SalesKpiMetric = (typeof SALES_KPI_METRICS)[number];

export function isSalesKpiMetric(value: string): value is SalesKpiMetric {
  return (SALES_KPI_METRICS as readonly string[]).includes(value);
}

export type KpiStatusEvent = {
  leadId: string;
  fromStatus: string | null;
  toStatus: string;
  changedByUserId: string | null;
  createdAt: string;
};

export type KpiActivity = {
  leadId: string;
  actorUserId: string | null;
  occurredAt: string;
};

export type KpiCompletedTask = {
  leadId: string;
  completedByUserId: string | null;
  completedAt: string | null;
  status: string;
};

export type ManagerGmvTrips = { gmv: number; trips: number };

export type ManagerKpiRow = {
  managerUserId: string;
  managerName: string;
  actuals: Record<SalesKpiMetric, number>;
};

export type BuildManagerKpisInput = {
  leads: SalesLead[];
  stages: PipelineStage[];
  statusEvents: KpiStatusEvent[];
  activities: KpiActivity[];
  completedTasks: KpiCompletedTask[];
  gmvTripsByManager: Record<string, ManagerGmvTrips>;
  managers: Array<{ userId: string; name: string }>;
  /** Inclusive period start (ISO). */
  periodStart: string;
  /** Inclusive period end (ISO). */
  periodEnd: string;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function timeOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function emptyActuals(): Record<SalesKpiMetric, number> {
  return {
    signed_count: 0,
    conversion_pct: 0,
    leads_worked: 0,
    activities_logged: 0,
    tasks_completed: 0,
    avg_cycle_days: 0,
    avg_response_hours: 0,
    weighted_forecast: 0,
    gmv: 0,
    trips: 0,
  };
}

export function buildManagerKpis(input: BuildManagerKpisInput): ManagerKpiRow[] {
  const {
    leads,
    stages,
    statusEvents,
    activities,
    completedTasks,
    gmvTripsByManager,
    managers,
    periodStart,
    periodEnd,
  } = input;

  const startMs = timeOf(periodStart) ?? 0;
  const endMs = timeOf(periodEnd) ?? Number.MAX_SAFE_INTEGER;
  const inRange = (iso: string | null | undefined): boolean => {
    const t = timeOf(iso);
    return t !== null && t >= startMs && t <= endMs;
  };

  const stageByKey = new Map(stages.map((stage) => [stage.key, stage]));
  const stageProbabilityByKey = Object.fromEntries(
    stages.map((stage) => [stage.key, stage.probability]),
  );
  const isWon = (lead: SalesLead) =>
    stageByKey.get(lead.status)?.isWon ?? lead.status === "signed";
  const isLost = (lead: SalesLead) =>
    stageByKey.get(lead.status)?.isLost ?? lead.status === "rejected";
  const isOpen = (lead: SalesLead) => !isWon(lead) && !isLost(lead);

  // Per-manager accumulators.
  type Acc = {
    signedCount: number;
    createdInPeriod: number;
    weightedForecast: number;
    activitiesLogged: number;
    tasksCompleted: number;
    cycleDaysSum: number;
    cycleDaysN: number;
    responseHoursSum: number;
    responseHoursN: number;
    worked: Set<string>;
  };
  const acc = new Map<string, Acc>();
  const ensure = (userId: string): Acc => {
    let value = acc.get(userId);
    if (!value) {
      value = {
        signedCount: 0,
        createdInPeriod: 0,
        weightedForecast: 0,
        activitiesLogged: 0,
        tasksCompleted: 0,
        cycleDaysSum: 0,
        cycleDaysN: 0,
        responseHoursSum: 0,
        responseHoursN: 0,
        worked: new Set<string>(),
      };
      acc.set(userId, value);
    }
    return value;
  };

  // Leads: signed count / cycle, conversion denominator, weighted forecast, worked.
  for (const lead of leads) {
    const owner = lead.assignedManagerUserId;
    if (!owner) continue;
    const a = ensure(owner);

    if (inRange(lead.createdAt)) {
      a.createdInPeriod += 1;
      a.worked.add(lead.id);
    }

    if (isOpen(lead)) {
      a.weightedForecast += computeWeightedPipelineValue(lead, stageProbabilityByKey);
    }

    if (isWon(lead) && inRange(lead.statusEnteredAt)) {
      a.signedCount += 1;
      const created = timeOf(lead.createdAt);
      const signed = timeOf(lead.statusEnteredAt);
      if (created !== null && signed !== null && signed >= created) {
        a.cycleDaysSum += (signed - created) / DAY_MS;
        a.cycleDaysN += 1;
      }
    }
  }

  // Status events: worked (mover) + first response time (leaving "new").
  const leadCreatedById = new Map(leads.map((lead) => [lead.id, lead.createdAt]));
  const firstResponseByLead = new Map<string, KpiStatusEvent>();
  for (const event of statusEvents) {
    if (event.changedByUserId && inRange(event.createdAt)) {
      ensure(event.changedByUserId).worked.add(event.leadId);
    }
    // Earliest event that leaves the "new" stage is the first response.
    if (event.fromStatus === "new") {
      const existing = firstResponseByLead.get(event.leadId);
      if (!existing || (timeOf(event.createdAt) ?? 0) < (timeOf(existing.createdAt) ?? 0)) {
        firstResponseByLead.set(event.leadId, event);
      }
    }
  }
  for (const [leadId, event] of firstResponseByLead) {
    if (!event.changedByUserId || !inRange(event.createdAt)) continue;
    const created = timeOf(leadCreatedById.get(leadId));
    const responded = timeOf(event.createdAt);
    if (created === null || responded === null || responded < created) continue;
    const a = ensure(event.changedByUserId);
    a.responseHoursSum += (responded - created) / HOUR_MS;
    a.responseHoursN += 1;
  }

  // Activities logged in period.
  for (const activity of activities) {
    if (!activity.actorUserId || !inRange(activity.occurredAt)) continue;
    const a = ensure(activity.actorUserId);
    a.activitiesLogged += 1;
    a.worked.add(activity.leadId);
  }

  // Tasks completed in period.
  for (const task of completedTasks) {
    if (task.status !== "done") continue;
    if (!task.completedByUserId || !inRange(task.completedAt)) continue;
    ensure(task.completedByUserId).tasksCompleted += 1;
  }

  const nameByUserId = new Map(managers.map((m) => [m.userId, m.name]));
  const managerIds = new Set<string>(managers.map((m) => m.userId));
  for (const id of acc.keys()) managerIds.add(id);
  for (const id of Object.keys(gmvTripsByManager)) managerIds.add(id);

  const rows: ManagerKpiRow[] = [...managerIds].map((userId) => {
    const a = acc.get(userId);
    const gmvTrips = gmvTripsByManager[userId] ?? { gmv: 0, trips: 0 };
    const actuals = emptyActuals();
    if (a) {
      actuals.signed_count = a.signedCount;
      actuals.conversion_pct =
        a.createdInPeriod > 0 ? round((a.signedCount / a.createdInPeriod) * 100) : 0;
      actuals.leads_worked = a.worked.size;
      actuals.activities_logged = a.activitiesLogged;
      actuals.tasks_completed = a.tasksCompleted;
      actuals.avg_cycle_days = a.cycleDaysN > 0 ? round(a.cycleDaysSum / a.cycleDaysN) : 0;
      actuals.avg_response_hours =
        a.responseHoursN > 0 ? round(a.responseHoursSum / a.responseHoursN) : 0;
      actuals.weighted_forecast = Math.round(a.weightedForecast);
    }
    actuals.gmv = Math.round(gmvTrips.gmv);
    actuals.trips = gmvTrips.trips;
    return {
      managerUserId: userId,
      managerName: nameByUserId.get(userId) ?? userId,
      actuals,
    };
  });

  rows.sort((a, b) => b.actuals.signed_count - a.actuals.signed_count || a.managerName.localeCompare(b.managerName));
  return rows;
}
