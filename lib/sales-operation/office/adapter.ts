import type { SalesLead, SalesLeadStatus, UpdateSalesLeadInput } from "@/lib/sales-operation/types";
import type { StageMissingField } from "@/lib/sales-operation/status-transitions";
import { buildAttentionItems } from "@/lib/sales-operation/office/attention";
import type {
  OfficeAnalyticsSnapshot,
  OfficeCrmSnapshot,
  OfficeDiscoverySnapshot,
  OfficeManagerAvatar,
  OfficeMeetingItem,
  OfficeNotificationItem,
  OfficePipelineSticker,
  OfficeReceptionSnapshot,
  OfficeTaskItem,
} from "@/lib/sales-operation/office/types";
import {
  MANAGER_COLORS,
  daysSince,
  isStuckLead,
} from "@/lib/sales-operation/office/types";

export type OfficeTransitionPayload = {
  fields?: UpdateSalesLeadInput;
  accountManagerUserId?: string | null;
  accountManagerName?: string | null;
  followUpTask?: {
    title: string;
    description: string | null;
    dueAt: string | null;
    assignedToUserId: string | null;
    assignedToName: string | null;
  } | null;
  contact?: {
    fullName: string;
    email: string | null;
    mobilePhone: string | null;
  } | null;
};

type NotificationRow = {
  id: string;
  title?: string;
  body?: string | null;
  message?: string;
  isRead?: boolean;
  readAt?: string | null;
  leadId?: string | null;
  link?: string | null;
  createdAt?: string | null;
};
type MeetingRow = {
  id: string;
  title?: string;
  subject?: string;
  startsAt?: string;
  startAt?: string;
  scheduledAt?: string;
};
type TaskRow = {
  id: string;
  title?: string;
  status?: string;
  dueAt?: string | null;
  dueDate?: string | null;
  leadId?: string | null;
  leadName?: string | null;
  assignedToUserId?: string | null;
};

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfTodayMs() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function meetingTimeMs(m: MeetingRow): number | null {
  const raw = m.startsAt ?? m.startAt ?? m.scheduledAt;
  if (!raw) return null;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : null;
}

function isOverdueTask(task: TaskRow): boolean {
  if (task.status === "done" || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  const raw = task.dueAt ?? task.dueDate;
  if (!raw) return false;
  const t = Date.parse(raw);
  return Number.isFinite(t) && t < Date.now();
}

function buildBriefing(
  name: string | undefined,
  reception: Omit<OfficeReceptionSnapshot, "briefing">,
): string {
  const who = name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const lines = [
    `${greet} ${who}.`,
    `${reception.overdueTasks} overdue · ${reception.unassignedNew} unassigned new · ${reception.stuckDeals} stuck`,
    `${reception.meetingsToday} meetings today · ${reception.unreadNotifications} unread`,
  ];
  return lines.join("\n");
}

async function safeJson<T>(res: Response | null): Promise<T | null> {
  if (!res) return null;
  return (await res.json().catch(() => null)) as T | null;
}

export async function fetchOfficeCrmSnapshot(opts?: {
  userName?: string;
}): Promise<OfficeCrmSnapshot> {
  const [
    leadsRes,
    notifRes,
    meetingsRes,
    tasksRes,
    stagesRes,
    rosterRes,
    analyticsRes,
    discoveryRes,
  ] = await Promise.all([
    fetch("/api/sales-operation/leads", { cache: "no-store" }),
    fetch("/api/sales-operation/notifications", { cache: "no-store" }),
    fetch("/api/sales-operation/meetings", { cache: "no-store" }),
    fetch("/api/sales-operation/tasks?scope=mine&status=open", { cache: "no-store" }),
    fetch("/api/sales-operation/config/stages", { cache: "no-store" }),
    fetch("/api/sales-operation/office/roster", { cache: "no-store" }).catch(() => null),
    fetch("/api/sales-operation/analytics/summary", { cache: "no-store" }).catch(() => null),
    fetch("/api/sales-operation/lead-discovery/campaigns", { cache: "no-store" }).catch(() => null),
  ]);

  const leadsData = await safeJson<{ ok?: boolean; leads?: SalesLead[] }>(leadsRes);
  const notifData = await safeJson<{ ok?: boolean; notifications?: NotificationRow[] }>(notifRes);
  const meetingsData = await safeJson<{ ok?: boolean; meetings?: MeetingRow[] }>(meetingsRes);
  const tasksData = await safeJson<{ ok?: boolean; tasks?: TaskRow[] }>(tasksRes);
  const stagesData = await safeJson<{
    ok?: boolean;
    stages?: Array<{ key: string; label: string; isActive?: boolean; orderIndex?: number }>;
  }>(stagesRes);
  const rosterData = await safeJson<{
    ok?: boolean;
    managers?: Array<{ userId?: string; id?: string; name?: string; role?: string }>;
  }>(rosterRes);
  const analyticsData = await safeJson<{
    ok?: boolean;
    summary?: {
      leadsTotal?: number;
      byStatus?: Record<string, number>;
      signedConversionPct?: number;
    };
  }>(analyticsRes);
  const discoveryData = await safeJson<{
    ok?: boolean;
    error?: string;
    campaigns?: Array<{ id: string; status?: string; isActive?: boolean }>;
  }>(discoveryRes);

  const leads = leadsData?.ok && Array.isArray(leadsData.leads) ? leadsData.leads : [];
  const notificationsRaw =
    notifData?.ok && Array.isArray(notifData.notifications) ? notifData.notifications : [];
  const meetingsRaw =
    meetingsData?.ok && Array.isArray(meetingsData.meetings) ? meetingsData.meetings : [];
  const tasksRaw = tasksData?.ok && Array.isArray(tasksData.tasks) ? tasksData.tasks : [];

  const dayStart = startOfTodayMs();
  const dayEnd = endOfTodayMs();

  const officeTasks: OfficeTaskItem[] = tasksRaw.slice(0, 40).map((task) => ({
    id: task.id,
    title: task.title ?? "Task",
    dueAt: task.dueAt ?? task.dueDate ?? null,
    status: task.status ?? "open",
    leadId: task.leadId ?? null,
    leadName: task.leadName ?? null,
    overdue: isOverdueTask(task),
    assignedToUserId: task.assignedToUserId ?? null,
  }));

  const officeMeetings: OfficeMeetingItem[] = meetingsRaw
    .map((m) => {
      const startsAt = m.startsAt ?? m.startAt ?? m.scheduledAt;
      if (!startsAt) return null;
      const t = Date.parse(startsAt);
      if (!Number.isFinite(t) || t < dayStart || t > dayEnd) return null;
      return {
        id: m.id,
        title: m.title ?? m.subject ?? "Meeting",
        startsAt,
      };
    })
    .filter((m): m is OfficeMeetingItem => Boolean(m))
    .slice(0, 20);

  const officeNotifications: OfficeNotificationItem[] = notificationsRaw.slice(0, 30).map((n) => ({
    id: n.id,
    title: n.title ?? n.body ?? n.message ?? "Notification",
    body: n.body ?? null,
    isRead: typeof n.isRead === "boolean" ? n.isRead : !n.readAt,
    leadId: n.leadId ?? null,
    link: n.link ?? null,
    createdAt: n.createdAt ?? null,
  }));

  const openLeads = leads.filter((l) => l.status !== "signed" && l.status !== "rejected");
  const unassignedNew = openLeads.filter((l) => l.status === "new" && !l.assignedManagerUserId)
    .length;
  const stuckDeals = openLeads.filter((l) => isStuckLead(l)).length;
  const meetingsToday = officeMeetings.length;
  const unreadNotifications = officeNotifications.filter((n) => !n.isRead).length;
  const newLeads = openLeads.filter((l) => l.status === "new").length;
  const overdueTasks = officeTasks.filter((t) => t.overdue).length;

  const receptionBase = {
    meetingsToday,
    unreadNotifications,
    newLeads,
    overdueTasks,
    unassignedNew,
    stuckDeals,
  };
  const reception: OfficeReceptionSnapshot = {
    ...receptionBase,
    briefing: buildBriefing(opts?.userName, receptionBase),
  };

  const stickers: OfficePipelineSticker[] = openLeads.slice(0, 100).map((l) => ({
    id: l.id,
    title: l.fullName || l.companyName || "Lead",
    company: l.companyName,
    status: l.status,
    ownerUserId: l.assignedManagerUserId ?? null,
    ownerName: l.assignedManagerName ?? null,
    daysInStage: daysSince(l.statusEnteredAt),
  }));

  const byOwner = new Map<
    string,
    { count: number; stuck: number; name: string }
  >();
  for (const lead of openLeads) {
    if (!lead.assignedManagerUserId) continue;
    const cur = byOwner.get(lead.assignedManagerUserId) ?? {
      count: 0,
      stuck: 0,
      name: lead.assignedManagerName ?? lead.assignedManagerUserId,
    };
    cur.count += 1;
    if (isStuckLead(lead)) cur.stuck += 1;
    cur.name = lead.assignedManagerName ?? cur.name;
    byOwner.set(lead.assignedManagerUserId, cur);
  }

  function severityFor(open: number, stuck: number): OfficeManagerAvatar["severity"] {
    if (stuck > 0) return "critical";
    if (open >= 8) return "warn";
    return "ok";
  }

  function toAvatar(
    id: string,
    name: string,
    index: number,
  ): OfficeManagerAvatar {
    const stats = byOwner.get(id);
    const open = stats?.count ?? 0;
    const stuck = stats?.stuck ?? 0;
    return {
      id,
      name: name || stats?.name || id,
      openLeads: open,
      stuckLeads: stuck,
      label: stuck > 0 ? `${stuck} stuck · ${open} open` : open > 0 ? `${open} open` : "Clear",
      severity: severityFor(open, stuck),
      color: MANAGER_COLORS[index % MANAGER_COLORS.length],
    };
  }

  const seen = new Set<string>();
  let managers: OfficeManagerAvatar[] = [];

  if (rosterData?.ok && Array.isArray(rosterData.managers) && rosterData.managers.length) {
    for (const m of rosterData.managers) {
      const id = String(m.userId ?? m.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      managers.push(toAvatar(id, m.name ?? id, managers.length));
    }
  }

  // Always merge owners from open leads (covers users missing from roster / permission gaps).
  for (const [id, v] of byOwner.entries()) {
    if (seen.has(id)) continue;
    seen.add(id);
    managers.push(toAvatar(id, v.name, managers.length));
  }

  managers = managers
    .sort((a, b) => {
      const sev = { critical: 0, warn: 1, ok: 2 } as const;
      const d = sev[a.severity] - sev[b.severity];
      if (d !== 0) return d;
      return b.openLeads - a.openLeads || a.name.localeCompare(b.name);
    })
    .slice(0, 12)
    .map((m, i) => ({ ...m, color: MANAGER_COLORS[i % MANAGER_COLORS.length] }));

  const stages = (stagesData?.ok ? stagesData.stages ?? [] : [])
    .filter((s) => s.isActive !== false)
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0))
    .map((s) => ({ key: s.key, label: s.label }));

  const fallbackStages: Array<{ key: string; label: string }> = [
    { key: "new", label: "New" },
    { key: "in_progress", label: "In Progress" },
    { key: "proposal_sent", label: "Proposal Sent" },
    { key: "negotiation", label: "Negotiation" },
  ];

  const leadsById: Record<string, SalesLead> = {};
  for (const lead of leads) leadsById[lead.id] = lead;

  const byStatusFromLeads: Record<string, number> = {};
  for (const lead of leads) {
    byStatusFromLeads[lead.status] = (byStatusFromLeads[lead.status] ?? 0) + 1;
  }

  const analytics: OfficeAnalyticsSnapshot =
    analyticsData?.ok && analyticsData.summary
      ? {
          leadsTotal: analyticsData.summary.leadsTotal ?? leads.length,
          byStatus: analyticsData.summary.byStatus ?? byStatusFromLeads,
          signedConversionPct: analyticsData.summary.signedConversionPct ?? 0,
        }
      : {
          leadsTotal: leads.length,
          byStatus: byStatusFromLeads,
          signedConversionPct:
            leads.length > 0 ? ((byStatusFromLeads.signed ?? 0) / leads.length) * 100 : 0,
        };

  let discovery: OfficeDiscoverySnapshot;
  if (discoveryData?.ok && Array.isArray(discoveryData.campaigns)) {
    const campaigns = discoveryData.campaigns;
    discovery = {
      enabled: true,
      campaignCount: campaigns.length,
      activeCount: campaigns.filter((c) => c.status === "active" || c.isActive).length,
    };
  } else {
    discovery = {
      enabled: false,
      campaignCount: 0,
      activeCount: 0,
      error: discoveryData?.error ?? null,
    };
  }

  const attention = buildAttentionItems({
    tasks: officeTasks,
    leads: openLeads,
    meetings: officeMeetings,
    notifications: officeNotifications,
  });

  return {
    loadedAt: new Date().toISOString(),
    reception,
    managers,
    stickers,
    leadsById,
    stages: stages.length ? stages : fallbackStages,
    tasks: officeTasks,
    meetings: officeMeetings,
    notifications: officeNotifications,
    analytics,
    discovery,
    attention,
  };
}

export type OfficeTransitionResult =
  | { ok: true; lead: SalesLead }
  | {
      ok: false;
      needsGate: true;
      missing: StageMissingField[];
      lead: SalesLead | null;
      error?: string;
    }
  | { ok: false; needsGate: false; error: string };

export async function transitionOfficeLead(
  leadId: string,
  toStatus: SalesLeadStatus,
  payload?: OfficeTransitionPayload,
): Promise<OfficeTransitionResult> {
  if (payload?.contact) {
    const contactRes = await fetch(`/api/sales-operation/leads/${leadId}/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fullName: payload.contact.fullName,
        email: payload.contact.email,
        mobilePhone: payload.contact.mobilePhone,
        isPrimary: true,
      }),
    });
    if (!contactRes.ok && contactRes.status !== 409) {
      const contactData = (await contactRes.json().catch(() => null)) as {
        error?: string;
      } | null;
      return {
        ok: false,
        needsGate: false,
        error: contactData?.error ?? "Failed to create contact.",
      };
    }
  }

  const preflightRes = await fetch(`/api/sales-operation/leads/${leadId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStatus, preflightOnly: true }),
  });
  const preflight = (await preflightRes.json().catch(() => null)) as {
    ok?: boolean;
    missing?: StageMissingField[];
    lead?: SalesLead;
    error?: string;
  } | null;

  if (!preflightRes.ok) {
    return {
      ok: false,
      needsGate: false,
      error: preflight?.error ?? "Failed to validate stage move.",
    };
  }
  if (!payload && preflight && !preflight.ok && (preflight.missing?.length ?? 0) > 0) {
    return {
      ok: false,
      needsGate: true,
      missing: preflight.missing ?? [],
      lead: preflight.lead ?? null,
    };
  }

  const res = await fetch(`/api/sales-operation/leads/${leadId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      toStatus,
      fields: payload?.fields,
      accountManagerUserId: payload?.accountManagerUserId,
      accountManagerName: payload?.accountManagerName,
      followUpTask: payload?.followUpTask,
    }),
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    lead?: SalesLead;
    code?: string;
    missing?: StageMissingField[];
  } | null;

  if (res.status === 422 && data?.code === "STAGE_REQUIREMENTS") {
    return {
      ok: false,
      needsGate: true,
      missing: data.missing ?? [],
      lead: data.lead ?? null,
    };
  }
  if (!res.ok || !data?.ok || !data.lead) {
    return {
      ok: false,
      needsGate: false,
      error: data?.error ?? "Failed to move lead",
    };
  }
  return { ok: true, lead: data.lead };
}

export async function completeOfficeTask(taskId: string) {
  const res = await fetch(`/api/sales-operation/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "done" }),
  });
  const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? "Failed to complete task");
  }
}

export async function assignOfficeLeadToMe(
  leadId: string,
  user: { id: string; name: string },
): Promise<SalesLead> {
  const body: UpdateSalesLeadInput = {
    assignedManagerUserId: user.id,
    assignedManagerName: user.name,
  };
  const res = await fetch(`/api/sales-operation/leads/${leadId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    lead?: SalesLead;
  } | null;
  if (!res.ok || !data?.ok || !data.lead) {
    throw new Error(data?.error ?? "Failed to assign lead");
  }
  return data.lead;
}

export async function markOfficeNotificationsRead(ids?: string[], all?: boolean) {
  await fetch("/api/sales-operation/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(all ? { all: true } : { ids }),
  });
}
