import type { SalesLead } from "@/lib/sales-operation/types";
import type {
  OfficeAttentionItem,
  OfficeMeetingItem,
  OfficeNotificationItem,
  OfficeTaskItem,
} from "@/lib/sales-operation/office/types";
import { isStuckLead } from "@/lib/sales-operation/office/types";

/** Build prioritized attention queue for Ops Floor dock. */
export function buildAttentionItems(input: {
  tasks: OfficeTaskItem[];
  leads: SalesLead[];
  meetings: OfficeMeetingItem[];
  notifications: OfficeNotificationItem[];
}): OfficeAttentionItem[] {
  const items: OfficeAttentionItem[] = [];

  for (const task of input.tasks) {
    if (!task.overdue) continue;
    items.push({
      id: `task:${task.id}`,
      kind: "overdue_task",
      priority: 10,
      title: task.title,
      subtitle: task.leadName
        ? `Overdue · ${task.leadName}`
        : task.dueAt
          ? `Overdue · due ${new Date(task.dueAt).toLocaleString()}`
          : "Overdue task",
      leadId: task.leadId,
      taskId: task.id,
    });
  }

  for (const lead of input.leads) {
    if (lead.status !== "new") continue;
    if (lead.assignedManagerUserId) continue;
    items.push({
      id: `unassigned:${lead.id}`,
      kind: "unassigned_lead",
      priority: 20,
      title: lead.fullName || lead.companyName || "New lead",
      subtitle: lead.companyName
        ? `Unassigned · ${lead.companyName}`
        : "Unassigned new lead",
      leadId: lead.id,
      leadStatus: lead.status,
    });
  }

  for (const lead of input.leads) {
    if (lead.status === "signed" || lead.status === "rejected") continue;
    if (!isStuckLead(lead)) continue;
    items.push({
      id: `stuck:${lead.id}`,
      kind: "stuck_lead",
      priority: 30,
      title: lead.fullName || lead.companyName || "Deal",
      subtitle: `Stuck · ${lead.status.replace(/_/g, " ")}${
        lead.assignedManagerName ? ` · ${lead.assignedManagerName}` : ""
      }`,
      leadId: lead.id,
      leadStatus: lead.status,
    });
  }

  for (const n of input.notifications) {
    if (n.isRead) continue;
    items.push({
      id: `notif:${n.id}`,
      kind: "unread_notification",
      priority: 40,
      title: n.title,
      subtitle: n.body ?? "Unread notification",
      leadId: n.leadId,
      notificationId: n.id,
      link: n.link,
    });
  }

  const soon = Date.now() + 2 * 60 * 60 * 1000;
  for (const m of input.meetings) {
    const t = Date.parse(m.startsAt);
    if (!Number.isFinite(t) || t < Date.now() || t > soon) continue;
    items.push({
      id: `meet:${m.id}`,
      kind: "upcoming_meeting",
      priority: 50,
      title: m.title,
      subtitle: `Starts ${new Date(m.startsAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`,
      link: "/sales-operation/calendar",
    });
  }

  items.sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  return items.slice(0, 40);
}
