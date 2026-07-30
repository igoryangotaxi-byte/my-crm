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

export type OfficeReceptionSnapshot = {
  meetingsToday: number;
  unreadNotifications: number;
  newLeads: number;
  overdueTasks: number;
  briefing: string;
};

export type OfficeManagerAvatar = {
  id: string;
  name: string;
  openLeads: number;
  label: string;
};

export type OfficePipelineSticker = {
  id: string;
  title: string;
  company: string | null;
  status: SalesLeadStatus;
  ownerUserId: string | null;
  ownerName: string | null;
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
};

export type OfficeTaskItem = {
  id: string;
  title: string;
  dueAt: string | null;
  status: string;
  leadId: string | null;
  leadName: string | null;
  overdue: boolean;
};

export type OfficeMeetingItem = {
  id: string;
  title: string;
  startsAt: string;
};

export type OfficeNotificationItem = {
  id: string;
  title: string;
  readAt: string | null;
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
  | { type: "open_workbench"; mode: import("@/lib/sales-operation/office/agents").OfficeWorkbenchMode }
  | { type: "noop"; message: string };

export type {
  OfficeAgent,
  OfficeAgentId,
  OfficeWorkbenchMode,
  OfficeAgentAction,
} from "@/lib/sales-operation/office/agents";
export { OFFICE_AGENTS } from "@/lib/sales-operation/office/agents";

