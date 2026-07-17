import { computeWeightedPipelineValue } from "@/lib/sales-operation/display";
import type { PipelineStage, SalesLead, SalesSegment } from "@/lib/sales-operation/types";

export type FunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Conversion from the previous step as a percentage, null for the first step. */
  conversionFromPrev: number | null;
};

export type AgingBucket = {
  key: "0-7" | "8-14" | "15-30" | "30+";
  count: number;
};

export type StageAging = {
  key: string;
  label: string;
  openCount: number;
  avgDaysInStage: number;
};

export type WinLossStats = {
  signed: number;
  rejected: number;
  open: number;
  total: number;
  winRate: number;
  avgDaysToWin: number | null;
  avgDaysToLoss: number | null;
};

export type SourceStat = {
  source: string;
  total: number;
  signed: number;
  conversionPct: number;
};

export type SegmentStat = {
  segmentId: string | null;
  name: string;
  total: number;
  signed: number;
  potential: number;
  weightedValue: number;
};

export type ForecastMonth = {
  month: string | null;
  openCount: number;
  potential: number;
  weightedValue: number;
};

export type ForecastSummary = {
  totalOpen: number;
  totalPotential: number;
  totalWeighted: number;
  byMonth: ForecastMonth[];
};

export type DailyReport = {
  date: string;
  newLeads: number;
  movedForward: number;
  signed: number;
  rejected: number;
};

export type SalesAnalyticsReport = {
  generatedAt: string;
  funnel: FunnelStep[];
  aging: AgingBucket[];
  stageAging: StageAging[];
  winLoss: WinLossStats;
  bySource: SourceStat[];
  bySegment: SegmentStat[];
  forecast: ForecastSummary;
  daily: DailyReport;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return toDateKey(parsed);
}

function monthKeyOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(from: string | null | undefined, to: number): number | null {
  if (!from) return null;
  const then = new Date(from).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((to - then) / DAY_MS));
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

type StageMeta = {
  key: string;
  label: string;
  orderIndex: number;
  isWon: boolean;
  isLost: boolean;
};

function buildStageMeta(stages: PipelineStage[]): {
  byKey: Map<string, StageMeta>;
  forward: StageMeta[];
} {
  const byKey = new Map<string, StageMeta>();
  for (const stage of stages) {
    byKey.set(stage.key, {
      key: stage.key,
      label: stage.label,
      orderIndex: stage.orderIndex,
      isWon: stage.isWon,
      isLost: stage.isLost,
    });
  }
  const forward = [...byKey.values()]
    .filter((stage) => !stage.isLost)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  return { byKey, forward };
}

export function buildSalesAnalyticsReport(
  leads: SalesLead[],
  stages: PipelineStage[],
  segments: SalesSegment[],
  now: Date = new Date(),
): SalesAnalyticsReport {
  const nowMs = now.getTime();
  const todayKey = toDateKey(now);
  const { byKey, forward } = buildStageMeta(stages);
  const stageProbabilityByKey = Object.fromEntries(
    stages.map((stage) => [stage.key, stage.probability]),
  );

  const isWon = (lead: SalesLead) =>
    byKey.get(lead.status)?.isWon ?? lead.status === "signed";
  const isLost = (lead: SalesLead) =>
    byKey.get(lead.status)?.isLost ?? lead.status === "rejected";
  const isOpen = (lead: SalesLead) => !isWon(lead) && !isLost(lead);
  const orderOf = (lead: SalesLead) => byKey.get(lead.status)?.orderIndex ?? 0;

  // --- Funnel (current snapshot): active leads at their stage + all won leads. ---
  const funnel: FunnelStep[] = [];
  for (const stage of forward) {
    const count = leads.filter((lead) => {
      if (isLost(lead)) return false;
      if (isWon(lead)) return true;
      return orderOf(lead) >= stage.orderIndex;
    }).length;
    const prev = funnel.length > 0 ? funnel[funnel.length - 1]!.count : null;
    funnel.push({
      key: stage.key,
      label: stage.label,
      count,
      conversionFromPrev: prev === null ? null : prev > 0 ? round((count / prev) * 100) : 0,
    });
  }

  // --- Aging of open leads by days in current stage. ---
  const aging: AgingBucket[] = [
    { key: "0-7", count: 0 },
    { key: "8-14", count: 0 },
    { key: "15-30", count: 0 },
    { key: "30+", count: 0 },
  ];
  const stageAgingAcc = new Map<string, { label: string; total: number; sumDays: number }>();
  for (const stage of forward) {
    if (stage.isWon) continue;
    stageAgingAcc.set(stage.key, { label: stage.label, total: 0, sumDays: 0 });
  }

  for (const lead of leads) {
    if (!isOpen(lead)) continue;
    const days = daysBetween(lead.statusEnteredAt || lead.createdAt, nowMs) ?? 0;
    if (days <= 7) aging[0]!.count += 1;
    else if (days <= 14) aging[1]!.count += 1;
    else if (days <= 30) aging[2]!.count += 1;
    else aging[3]!.count += 1;

    const acc = stageAgingAcc.get(lead.status);
    if (acc) {
      acc.total += 1;
      acc.sumDays += days;
    }
  }

  const stageAging: StageAging[] = [...stageAgingAcc.entries()].map(([key, value]) => ({
    key,
    label: value.label,
    openCount: value.total,
    avgDaysInStage: value.total > 0 ? round(value.sumDays / value.total) : 0,
  }));

  // --- Win / loss. ---
  const wonLeads = leads.filter(isWon);
  const lostLeads = leads.filter(isLost);
  const openLeads = leads.filter(isOpen);
  const winDurations = wonLeads
    .map((lead) => daysBetween(lead.createdAt, new Date(lead.statusEnteredAt).getTime()))
    .filter((value): value is number => value !== null);
  const lossDurations = lostLeads
    .map((lead) => daysBetween(lead.createdAt, new Date(lead.statusEnteredAt).getTime()))
    .filter((value): value is number => value !== null);
  const decided = wonLeads.length + lostLeads.length;

  const winLoss: WinLossStats = {
    signed: wonLeads.length,
    rejected: lostLeads.length,
    open: openLeads.length,
    total: leads.length,
    winRate: decided > 0 ? round((wonLeads.length / decided) * 100) : 0,
    avgDaysToWin:
      winDurations.length > 0
        ? round(winDurations.reduce((a, b) => a + b, 0) / winDurations.length)
        : null,
    avgDaysToLoss:
      lossDurations.length > 0
        ? round(lossDurations.reduce((a, b) => a + b, 0) / lossDurations.length)
        : null,
  };

  // --- By source. ---
  const sourceAcc = new Map<string, { total: number; signed: number }>();
  for (const lead of leads) {
    const key = lead.source || "manual";
    const acc = sourceAcc.get(key) ?? { total: 0, signed: 0 };
    acc.total += 1;
    if (isWon(lead)) acc.signed += 1;
    sourceAcc.set(key, acc);
  }
  const bySource: SourceStat[] = [...sourceAcc.entries()]
    .map(([source, value]) => ({
      source,
      total: value.total,
      signed: value.signed,
      conversionPct: value.total > 0 ? round((value.signed / value.total) * 100) : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // --- By segment. ---
  const segmentNameById = new Map(segments.map((segment) => [segment.id, segment.name]));
  const segmentAcc = new Map<
    string,
    { name: string; total: number; signed: number; potential: number; weighted: number }
  >();
  for (const lead of leads) {
    const id = lead.segmentId ?? "__none__";
    const name = lead.segmentId ? segmentNameById.get(lead.segmentId) ?? lead.segmentId : "Unassigned";
    const acc = segmentAcc.get(id) ?? { name, total: 0, signed: 0, potential: 0, weighted: 0 };
    acc.total += 1;
    if (isWon(lead)) acc.signed += 1;
    acc.potential += lead.estimatedMonthlyPotential ?? 0;
    if (isOpen(lead)) acc.weighted += computeWeightedPipelineValue(lead, stageProbabilityByKey);
    segmentAcc.set(id, acc);
  }
  const bySegment: SegmentStat[] = [...segmentAcc.entries()]
    .map(([id, value]) => ({
      segmentId: id === "__none__" ? null : id,
      name: value.name,
      total: value.total,
      signed: value.signed,
      potential: value.potential,
      weightedValue: value.weighted,
    }))
    .sort((a, b) => b.total - a.total);

  // --- Forecast (open pipeline by expected close month). ---
  const monthAcc = new Map<string | null, { openCount: number; potential: number; weighted: number }>();
  let totalPotential = 0;
  let totalWeighted = 0;
  for (const lead of openLeads) {
    const month = monthKeyOf(lead.expectedCloseDate);
    const weighted = computeWeightedPipelineValue(lead, stageProbabilityByKey);
    const potential = lead.estimatedMonthlyPotential ?? 0;
    totalPotential += potential;
    totalWeighted += weighted;
    const acc = monthAcc.get(month) ?? { openCount: 0, potential: 0, weighted: 0 };
    acc.openCount += 1;
    acc.potential += potential;
    acc.weighted += weighted;
    monthAcc.set(month, acc);
  }
  const byMonth: ForecastMonth[] = [...monthAcc.entries()]
    .map(([month, value]) => ({
      month,
      openCount: value.openCount,
      potential: value.potential,
      weightedValue: value.weighted,
    }))
    .sort((a, b) => {
      if (a.month === null) return 1;
      if (b.month === null) return -1;
      return a.month.localeCompare(b.month);
    });

  const forecast: ForecastSummary = {
    totalOpen: openLeads.length,
    totalPotential,
    totalWeighted,
    byMonth,
  };

  // --- Daily report (today snapshot). ---
  const daily: DailyReport = {
    date: todayKey,
    newLeads: leads.filter((lead) => dateKeyOf(lead.createdAt) === todayKey).length,
    movedForward: leads.filter(
      (lead) => isOpen(lead) && dateKeyOf(lead.statusEnteredAt) === todayKey,
    ).length,
    signed: wonLeads.filter((lead) => dateKeyOf(lead.statusEnteredAt) === todayKey).length,
    rejected: lostLeads.filter((lead) => dateKeyOf(lead.statusEnteredAt) === todayKey).length,
  };

  return {
    generatedAt: now.toISOString(),
    funnel,
    aging,
    stageAging,
    winLoss,
    bySource,
    bySegment,
    forecast,
    daily,
  };
}

/** Escapes a value for CSV output (RFC 4180). */
export function toCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function rowsToCsv(rows: Array<Array<unknown>>): string {
  return rows.map((row) => row.map(toCsvCell).join(",")).join("\r\n");
}
