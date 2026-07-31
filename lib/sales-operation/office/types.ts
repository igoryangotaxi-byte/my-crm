import type { SalesLead, SalesLeadStatus } from "@/lib/sales-operation/types";

export type OfficeFocusEntity =
  | { kind: "lead"; id: string }
  | { kind: "task"; id: string }
  | { kind: "meeting"; id: string }
  | { kind: "manager"; id: string }
  | null;

export type OfficeRoomId =
  | "reception"
  | "sales"
  | "pipeline"
  | "calendar"
  | "tasks"
  | "dashboard"
  | "automation";

export type OfficeDockTab = "attention" | "my_desk" | "team";

export type OfficePipelineFilter =
  | { kind: "all" }
  | { kind: "mine" }
  | { kind: "stuck" }
  | { kind: "status"; status: SalesLeadStatus }
  | { kind: "owner"; ownerUserId: string };

export type OfficeManagerSeverity = "critical" | "warn" | "ok";

export type OfficeReceptionSnapshot = {
  meetingsToday: number;
  unreadNotifications: number;
  newLeads: number;
  overdueTasks: number;
  unassignedNew: number;
  stuckDeals: number;
  briefing: string;
};

export type OfficeManagerAvatar = {
  id: string;
  name: string;
  openLeads: number;
  stuckLeads: number;
  label: string;
  severity: OfficeManagerSeverity;
  color: string;
};

export type OfficePipelineSticker = {
  id: string;
  title: string;
  company: string | null;
  status: SalesLeadStatus;
  ownerUserId: string | null;
  ownerName: string | null;
  daysInStage: number;
};

export type OfficeAttentionKind =
  | "overdue_task"
  | "unassigned_lead"
  | "stuck_lead"
  | "unread_notification"
  | "upcoming_meeting";

export type OfficeAttentionItem = {
  id: string;
  kind: OfficeAttentionKind;
  priority: number;
  title: string;
  subtitle: string;
  leadId?: string | null;
  leadStatus?: SalesLeadStatus | null;
  taskId?: string | null;
  notificationId?: string | null;
  link?: string | null;
};

export type OfficeCrmSnapshot = {
  loadedAt: string;
  reception: OfficeReceptionSnapshot;
  managers: OfficeManagerAvatar[];
  stickers: OfficePipelineSticker[];
  leadsById: Record<string, SalesLead>;
  stages: Array<{ key: string; label: string }>;
  tasks: OfficeTaskItem[];
  meetings: OfficeMeetingItem[];
  notifications: OfficeNotificationItem[];
  analytics: OfficeAnalyticsSnapshot;
  discovery: OfficeDiscoverySnapshot;
  attention: OfficeAttentionItem[];
};

export type OfficeTaskItem = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  leadId: string | null;
  leadName: string | null;
  overdue: boolean;
  assignedToUserId?: string | null;
};

export type OfficeMeetingItem = {
  id: string;
  title: string;
  startsAt: string;
};

export type OfficeNotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  isRead: boolean;
  leadId?: string | null;
  link?: string | null;
  createdAt?: string | null;
};

export type OfficeAnalyticsSnapshot = {
  leadsTotal: number;
  byStatus: Record<string, number>;
  signedConversionPct: number;
};

export type OfficeDiscoverySnapshot = {
  enabled: boolean;
  campaignCount: number;
  activeCount: number;
  error?: string | null;
};

export type OfficeIntentAction =
  | { type: "open_pipeline"; status?: SalesLeadStatus }
  | { type: "open_lead"; leadId: string }
  | { type: "open_room"; roomId: OfficeRoomId }
  | { type: "open_classic"; path: string }
  | { type: "open_dock"; tab: OfficeDockTab; ownerUserId?: string; filter?: OfficePipelineFilter }
  | { type: "noop"; message: string };

export const NEXT_PIPELINE_STATUS: Partial<Record<SalesLeadStatus, SalesLeadStatus>> = {
  new: "in_progress",
  in_progress: "proposal_sent",
  proposal_sent: "negotiation",
  negotiation: "signed",
};

export const MANAGER_COLORS = [
  "#dc2626",
  "#2563eb",
  "#059669",
  "#7c3aed",
  "#0891b2",
  "#ea580c",
  "#d97706",
  "#be185d",
  "#4f46e5",
  "#0d9488",
];

export function daysSince(iso: string | null | undefined): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((Date.now() - t) / 86_400_000));
}

export function isStuckLead(lead: Pick<SalesLead, "status" | "statusEnteredAt">): boolean {
  if (lead.status === "negotiation") return true;
  if (lead.status === "proposal_sent" && daysSince(lead.statusEnteredAt) >= 7) return true;
  if (lead.status === "in_progress" && daysSince(lead.statusEnteredAt) >= 14) return true;
  return false;
}

export function filterStickers(
  stickers: OfficePipelineSticker[],
  filter: OfficePipelineFilter,
  currentUserId?: string | null,
): OfficePipelineSticker[] {
  switch (filter.kind) {
    case "mine":
      return stickers.filter((s) => s.ownerUserId && s.ownerUserId === currentUserId);
    case "stuck":
      return stickers.filter(
        (s) =>
          s.status === "negotiation" ||
          (s.status === "proposal_sent" && s.daysInStage >= 7) ||
          (s.status === "in_progress" && s.daysInStage >= 14),
      );
    case "status":
      return stickers.filter((s) => s.status === filter.status);
    case "owner":
      return stickers.filter((s) => s.ownerUserId === filter.ownerUserId);
    default:
      return stickers;
  }
}
