import type { SalesLead, SalesLeadStatus } from "@/lib/sales-operation/types";
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

type NotificationRow = {
  id: string;
  title?: string;
  body?: string;
  message?: string;
  readAt?: string | null;
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
  return [
    `${greet} ${who}.`,
    "Today you have:",
    `${reception.meetingsToday} meetings`,
    `${reception.newLeads} new leads`,
    `${reception.overdueTasks} overdue tasks`,
    reception.unreadNotifications
      ? `${reception.unreadNotifications} unread notifications`
      : "No unread notifications",
  ].join("\n");
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
    managersRes,
    analyticsRes,
    discoveryRes,
  ] = await Promise.all([
    fetch("/api/sales-operation/leads", { cache: "no-store" }),
    fetch("/api/sales-operation/notifications", { cache: "no-store" }),
    fetch("/api/sales-operation/meetings", { cache: "no-store" }),
    fetch("/api/sales-operation/tasks?scope=mine&status=open", { cache: "no-store" }),
    fetch("/api/sales-operation/config/stages", { cache: "no-store" }),
    fetch("/api/sales-operation/analytics/managers", { cache: "no-store" }).catch(() => null),
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
  const managersData = await safeJson<{
    ok?: boolean;
    managers?: Array<{ userId?: string; id?: string; name?: string; openLeads?: number }>;
  }>(managersRes);
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

  const officeNotifications: OfficeNotificationItem[] = notificationsRaw.slice(0, 25).map((n) => ({
    id: n.id,
    title: n.title ?? n.body ?? n.message ?? "Notification",
    readAt: n.readAt ?? null,
    createdAt: n.createdAt ?? null,
  }));

  const meetingsToday = officeMeetings.length;
  const unreadNotifications = officeNotifications.filter((n) => !n.readAt).length;
  const newLeads = leads.filter((l) => l.status === "new").length;
  const overdueTasks = officeTasks.filter((t) => t.overdue).length;

  const receptionBase = {
    meetingsToday,
    unreadNotifications,
    newLeads,
    overdueTasks,
  };
  const reception: OfficeReceptionSnapshot = {
    ...receptionBase,
    briefing: buildBriefing(opts?.userName, receptionBase),
  };

  const stickers: OfficePipelineSticker[] = leads
    .filter((l) => l.status !== "signed" && l.status !== "rejected")
    .slice(0, 80)
    .map((l) => ({
      id: l.id,
      title: l.fullName || l.companyName || "Lead",
      company: l.companyName,
      status: l.status,
      ownerUserId: l.assignedManagerUserId ?? null,
      ownerName: l.assignedManagerName ?? null,
    }));

  const byOwner = new Map<string, { count: number; name: string }>();
  for (const lead of leads) {
    if (!lead.assignedManagerUserId) continue;
    if (lead.status === "signed" || lead.status === "rejected") continue;
    const cur = byOwner.get(lead.assignedManagerUserId) ?? {
      count: 0,
      name: lead.assignedManagerName ?? lead.assignedManagerUserId,
    };
    cur.count += 1;
    cur.name = lead.assignedManagerName ?? cur.name;
    byOwner.set(lead.assignedManagerUserId, cur);
  }

  let managers: OfficeManagerAvatar[] = [];
  if (managersData?.ok && Array.isArray(managersData.managers) && managersData.managers.length) {
    managers = managersData.managers.slice(0, 12).map((m) => {
      const id = String(m.userId ?? m.id ?? "unknown");
      const open = byOwner.get(id)?.count ?? m.openLeads ?? 0;
      const name = m.name ?? id;
      return {
        id,
        name,
        openLeads: open,
        label: open > 0 ? `Working ${open} leads` : "Available",
      };
    });
  } else {
    managers = Array.from(byOwner.entries())
      .slice(0, 12)
      .map(([id, v]) => ({
        id,
        name: v.name,
        openLeads: v.count,
        label: v.count > 0 ? `Working ${v.count} leads` : "Available",
      }));
  }

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

  const analytics: OfficeAnalyticsSnapshot = analyticsData?.ok && analyticsData.summary
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
  };
}

export async function transitionOfficeLead(leadId: string, toStatus: SalesLeadStatus) {
  const res = await fetch(`/api/sales-operation/leads/${leadId}/transition`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toStatus }),
  });
  const data = (await res.json().catch(() => null)) as {
    ok?: boolean;
    error?: string;
    lead?: SalesLead;
  } | null;
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? "Failed to move lead");
  }
  return data.lead;
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
