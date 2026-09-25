import {
  DRIVER_STATUS_COLUMNS,
  formatDriverStatus,
} from "@/lib/drivers-pipeline/display";
import {
  getDriverReceivedAt,
  getDriverReceivedDayKey,
} from "@/lib/drivers-pipeline/received-at";
import {
  driverTaxiLicenseBucket,
  isDriverNoLicenseLead,
} from "@/lib/drivers-pipeline/taxi-license";
import type { DriverLead, DriverLeadStatus } from "@/lib/drivers-pipeline/types";

const DAY_MS = 24 * 60 * 60 * 1000;

export type DriverNamedCount = {
  key: string;
  label: string;
  count: number;
};

export type DriverAssigneeStat = {
  key: string;
  label: string;
  total: number;
  new: number;
  inProgress: number;
  registered: number;
  rejected: number;
  conversionPct: number;
};

export type DriverEfficiencyStats = {
  avgDaysInCurrentStatus: number | null;
  avgDaysToRegistered: number | null;
  avgDaysToRejected: number | null;
  medianDaysToRegistered: number | null;
  medianDaysToRejected: number | null;
};

export type DriverDailyIntake = {
  date: string;
  count: number;
};

export type DriverAnalyticsReport = {
  generatedAt: string;
  from: string | null;
  to: string | null;
  filteredTotal: number;
  /** No-license leads removed from this report (shown only on License dashboard). */
  excludedNoLicenseCount: number;
  kpis: {
    total: number;
    new: number;
    inProgress: number;
    registered: number;
    rejected: number;
    open: number;
    conversionPct: number;
  };
  byStatus: DriverNamedCount[];
  byAssignee: DriverAssigneeStat[];
  byRejectReason: DriverNamedCount[];
  bySource: DriverNamedCount[];
  byCampaign: DriverNamedCount[];
  efficiency: DriverEfficiencyStats;
  intakeByDay: DriverDailyIntake[];
};

export type DriverLicenseAnalyticsReport = {
  generatedAt: string;
  from: string | null;
  to: string | null;
  filteredTotal: number;
  kpis: {
    total: number;
    withLicense: number;
    withoutLicense: number;
    unknown: number;
    withoutPct: number;
  };
  byBucket: DriverNamedCount[];
  withoutByDay: DriverDailyIntake[];
  withByDay: DriverDailyIntake[];
  withoutBySource: DriverNamedCount[];
  withoutByCampaign: DriverNamedCount[];
};

export type DriverAnalyticsDateRange = {
  from?: string | null;
  to?: string | null;
};

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? null;
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);
}

function round1(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function filterByReceivedRange(
  leads: DriverLead[],
  range: DriverAnalyticsDateRange,
): DriverLead[] {
  const from = range.from?.trim() || null;
  const to = range.to?.trim() || null;
  if (!from && !to) return leads;
  return leads.filter((lead) => {
    const day = getDriverReceivedDayKey(lead);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

function assigneeKey(lead: DriverLead): string {
  if (lead.assignedManagerUserId) return `user:${lead.assignedManagerUserId}`;
  const name = lead.assignedManagerName?.trim();
  if (name) return `legacy:${name}`;
  return "__unassigned__";
}

function assigneeLabel(lead: DriverLead): string {
  const name = lead.assignedManagerName?.trim();
  if (name) return name;
  if (lead.assignedManagerUserId) return "Assigned";
  return "Unassigned";
}

function emptyStatusCounts(): Record<DriverLeadStatus, number> {
  return {
    new: 0,
    in_progress: 0,
    registered: 0,
    rejected: 0,
  };
}

function buildLast30DaysSeries(
  now: Date,
  counts: Map<string, number>,
): DriverDailyIntake[] {
  const series: DriverDailyIntake[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const key = `${y}-${m}-${day}`;
    series.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return series;
}

/** Main Drivers dashboard — excludes No license leads entirely. */
export function buildDriverAnalyticsReport(
  leads: DriverLead[],
  range: DriverAnalyticsDateRange = {},
): DriverAnalyticsReport {
  const inRange = filterByReceivedRange(leads, range);
  const excludedNoLicenseCount = inRange.filter(isDriverNoLicenseLead).length;
  const filtered = inRange.filter((lead) => !isDriverNoLicenseLead(lead));
  const now = new Date();

  const statusCounts = emptyStatusCounts();
  const rejectMap = new Map<string, number>();
  const sourceMap = new Map<string, number>();
  const campaignMap = new Map<string, number>();
  const assigneeMap = new Map<
    string,
    { label: string; counts: Record<DriverLeadStatus, number> }
  >();
  const daysInStatus: number[] = [];
  const daysToRegistered: number[] = [];
  const daysToRejected: number[] = [];
  const intakeMap = new Map<string, number>();

  for (const lead of filtered) {
    statusCounts[lead.status] += 1;

    const aKey = assigneeKey(lead);
    const existing = assigneeMap.get(aKey);
    if (existing) {
      existing.counts[lead.status] += 1;
    } else {
      const counts = emptyStatusCounts();
      counts[lead.status] = 1;
      assigneeMap.set(aKey, { label: assigneeLabel(lead), counts });
    }

    if (lead.status === "rejected") {
      const reason = lead.rejectedSubstatus?.trim() || "Unspecified";
      rejectMap.set(reason, (rejectMap.get(reason) ?? 0) + 1);
    }

    const source = lead.source || "unknown";
    sourceMap.set(source, (sourceMap.get(source) ?? 0) + 1);

    const campaign = lead.campaignName?.trim();
    if (campaign) {
      campaignMap.set(campaign, (campaignMap.get(campaign) ?? 0) + 1);
    }

    const entered = new Date(lead.statusEnteredAt);
    if (!Number.isNaN(entered.getTime())) {
      daysInStatus.push(daysBetween(entered, now));
    }

    const received = getDriverReceivedAt(lead);
    const enteredAt = new Date(lead.statusEnteredAt);
    const closedAt = Number.isNaN(enteredAt.getTime()) ? now : enteredAt;
    if (lead.status === "registered") {
      daysToRegistered.push(daysBetween(received, closedAt));
    } else if (lead.status === "rejected") {
      daysToRejected.push(daysBetween(received, closedAt));
    }

    const day = getDriverReceivedDayKey(lead);
    intakeMap.set(day, (intakeMap.get(day) ?? 0) + 1);
  }

  const registered = statusCounts.registered;
  const rejected = statusCounts.rejected;
  const closed = registered + rejected;
  const conversionPct =
    closed > 0 ? Math.round((registered / closed) * 1000) / 10 : 0;

  const byStatus: DriverNamedCount[] = DRIVER_STATUS_COLUMNS.map((column) => ({
    key: column.status,
    label: column.label,
    count: statusCounts[column.status],
  }));

  const byAssignee: DriverAssigneeStat[] = [...assigneeMap.entries()]
    .map(([key, value]) => {
      const total =
        value.counts.new +
        value.counts.in_progress +
        value.counts.registered +
        value.counts.rejected;
      const closedLocal = value.counts.registered + value.counts.rejected;
      return {
        key,
        label: value.label,
        total,
        new: value.counts.new,
        inProgress: value.counts.in_progress,
        registered: value.counts.registered,
        rejected: value.counts.rejected,
        conversionPct:
          closedLocal > 0
            ? Math.round((value.counts.registered / closedLocal) * 1000) / 10
            : 0,
      };
    })
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  const byRejectReason: DriverNamedCount[] = [...rejectMap.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  const bySource: DriverNamedCount[] = [...sourceMap.entries()]
    .map(([key, count]) => ({
      key,
      label: key,
      count,
    }))
    .sort((a, b) => b.count - a.count);

  const byCampaign: DriverNamedCount[] = [...campaignMap.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 12);

  return {
    generatedAt: now.toISOString(),
    from: range.from?.trim() || null,
    to: range.to?.trim() || null,
    filteredTotal: filtered.length,
    excludedNoLicenseCount,
    kpis: {
      total: filtered.length,
      new: statusCounts.new,
      inProgress: statusCounts.in_progress,
      registered,
      rejected,
      open: statusCounts.new + statusCounts.in_progress,
      conversionPct,
    },
    byStatus,
    byAssignee,
    byRejectReason,
    bySource,
    byCampaign,
    efficiency: {
      avgDaysInCurrentStatus: round1(average(daysInStatus)),
      avgDaysToRegistered: round1(average(daysToRegistered)),
      avgDaysToRejected: round1(average(daysToRejected)),
      medianDaysToRegistered: round1(median(daysToRegistered)),
      medianDaysToRejected: round1(median(daysToRejected)),
    },
    intakeByDay: buildLast30DaysSeries(now, intakeMap),
  };
}

/** Dedicated Taxi license dashboard — With / Without / Unknown. */
export function buildDriverLicenseAnalyticsReport(
  leads: DriverLead[],
  range: DriverAnalyticsDateRange = {},
): DriverLicenseAnalyticsReport {
  const filtered = filterByReceivedRange(leads, range);
  const now = new Date();

  let withLicense = 0;
  let withoutLicense = 0;
  let unknown = 0;
  const withoutByDay = new Map<string, number>();
  const withByDay = new Map<string, number>();
  const withoutBySource = new Map<string, number>();
  const withoutByCampaign = new Map<string, number>();

  for (const lead of filtered) {
    const bucket = driverTaxiLicenseBucket(lead);
    const day = getDriverReceivedDayKey(lead);
    if (bucket === "with") {
      withLicense += 1;
      withByDay.set(day, (withByDay.get(day) ?? 0) + 1);
    } else if (bucket === "without") {
      withoutLicense += 1;
      withoutByDay.set(day, (withoutByDay.get(day) ?? 0) + 1);
      const source = lead.source || "unknown";
      withoutBySource.set(source, (withoutBySource.get(source) ?? 0) + 1);
      const campaign = lead.campaignName?.trim();
      if (campaign) {
        withoutByCampaign.set(campaign, (withoutByCampaign.get(campaign) ?? 0) + 1);
      }
    } else {
      unknown += 1;
    }
  }

  const total = filtered.length;
  const withoutPct =
    total > 0 ? Math.round((withoutLicense / total) * 1000) / 10 : 0;

  return {
    generatedAt: now.toISOString(),
    from: range.from?.trim() || null,
    to: range.to?.trim() || null,
    filteredTotal: total,
    kpis: {
      total,
      withLicense,
      withoutLicense,
      unknown,
      withoutPct,
    },
    byBucket: [
      { key: "with", label: "With license", count: withLicense },
      { key: "without", label: "Without license", count: withoutLicense },
      { key: "unknown", label: "Unknown", count: unknown },
    ],
    withoutByDay: buildLast30DaysSeries(now, withoutByDay),
    withByDay: buildLast30DaysSeries(now, withByDay),
    withoutBySource: [...withoutBySource.entries()]
      .map(([key, count]) => ({ key, label: key, count }))
      .sort((a, b) => b.count - a.count),
    withoutByCampaign: [...withoutByCampaign.entries()]
      .map(([label, count]) => ({ key: label, label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 12),
  };
}

export function formatDriverStatusLabel(status: DriverLeadStatus): string {
  return formatDriverStatus(status);
}
