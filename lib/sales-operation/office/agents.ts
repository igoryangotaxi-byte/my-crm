import type { OfficeRoomId } from "@/lib/sales-operation/office/types";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";

export type OfficeAgentId =
  | "igor_k"
  | "lior"
  | "igor_r"
  | "itay"
  | "egor"
  | "ido"
  | "adam"
  | "gal";

/** In-office workbench — CRM work without leaving 3D */
export type OfficeWorkbenchMode =
  | { kind: "briefing" }
  | {
      kind: "leads";
      title: string;
      status?: SalesLeadStatus;
      /** Match assignedManagerName (case-insensitive substring) */
      ownerMatch?: string;
      stuck?: boolean;
    }
  | { kind: "tasks"; overdueOnly?: boolean }
  | { kind: "meetings" }
  | { kind: "analytics" }
  | { kind: "discovery" }
  | { kind: "notifications" };

export type OfficeAgentAction =
  | { label: string; workbench: OfficeWorkbenchMode }
  | { label: string; classic: string };

export type OfficeAgent = {
  id: OfficeAgentId;
  name: string;
  role: string;
  color: string;
  hair: string;
  roomId: OfficeRoomId;
  pathOffset: number;
  walkSpeed: number;
  /** Substring(s) to match CRM assignedManagerName */
  ownerMatch: string[];
  /** Primary workbench opened on click */
  primary: OfficeWorkbenchMode;
  actions: OfficeAgentAction[];
};

export const OFFICE_AGENTS: OfficeAgent[] = [
  {
    id: "igor_k",
    name: "Igor K",
    role: "Team Lead",
    color: "#dc2626",
    hair: "#1f2937",
    roomId: "reception",
    pathOffset: 0,
    walkSpeed: 1.15,
    ownerMatch: ["igor k", "kuznetsov"],
    primary: { kind: "briefing" },
    actions: [
      { label: "Morning briefing", workbench: { kind: "briefing" } },
      {
        label: "All open deals",
        workbench: { kind: "leads", title: "All open deals" },
      },
      {
        label: "Stuck (negotiation)",
        workbench: { kind: "leads", title: "Stuck deals", stuck: true, status: "negotiation" },
      },
      { label: "Unread alerts", workbench: { kind: "notifications" } },
    ],
  },
  {
    id: "lior",
    name: "Lior",
    role: "Sales Manager",
    color: "#2563eb",
    hair: "#78350f",
    roomId: "sales",
    pathOffset: 1,
    walkSpeed: 1.05,
    ownerMatch: ["lior"],
    primary: { kind: "leads", title: "Lior's pipeline", ownerMatch: "lior" },
    actions: [
      {
        label: "My open leads",
        workbench: { kind: "leads", title: "Lior's leads", ownerMatch: "lior" },
      },
      {
        label: "New leads",
        workbench: { kind: "leads", title: "New leads", status: "new" },
      },
      {
        label: "Advance deals",
        workbench: { kind: "leads", title: "In progress", status: "in_progress", ownerMatch: "lior" },
      },
    ],
  },
  {
    id: "igor_r",
    name: "Igor R",
    role: "Sales Manager",
    color: "#059669",
    hair: "#374151",
    roomId: "sales",
    pathOffset: 2,
    walkSpeed: 1.1,
    ownerMatch: ["igor r", "rebkovets"],
    primary: { kind: "leads", title: "Igor R's pipeline", ownerMatch: "igor r" },
    actions: [
      {
        label: "My open leads",
        workbench: { kind: "leads", title: "Igor R's leads", ownerMatch: "igor r" },
      },
      {
        label: "Negotiation",
        workbench: {
          kind: "leads",
          title: "Negotiation",
          status: "negotiation",
          ownerMatch: "igor r",
        },
      },
      {
        label: "Stuck deals",
        workbench: { kind: "leads", title: "Stuck deals", stuck: true, status: "negotiation" },
      },
    ],
  },
  {
    id: "itay",
    name: "Itay",
    role: "Sales Manager",
    color: "#7c3aed",
    hair: "#111827",
    roomId: "pipeline",
    pathOffset: 3,
    walkSpeed: 0.95,
    ownerMatch: ["itay"],
    primary: { kind: "leads", title: "Itay's pipeline", ownerMatch: "itay" },
    actions: [
      {
        label: "My open leads",
        workbench: { kind: "leads", title: "Itay's leads", ownerMatch: "itay" },
      },
      {
        label: "In progress",
        workbench: { kind: "leads", title: "In progress", status: "in_progress" },
      },
      {
        label: "Proposal sent",
        workbench: { kind: "leads", title: "Proposal sent", status: "proposal_sent" },
      },
    ],
  },
  {
    id: "egor",
    name: "Egor",
    role: "Analytics",
    color: "#0891b2",
    hair: "#44403c",
    roomId: "dashboard",
    pathOffset: 4,
    walkSpeed: 1.0,
    ownerMatch: ["egor"],
    primary: { kind: "analytics" },
    actions: [
      { label: "Live funnel stats", workbench: { kind: "analytics" } },
      {
        label: "Open deals list",
        workbench: { kind: "leads", title: "All open deals" },
      },
      { label: "Full Analytics UI", classic: "/sales-operation/analytics" },
    ],
  },
  {
    id: "ido",
    name: "Ido",
    role: "Operations",
    color: "#ea580c",
    hair: "#292524",
    roomId: "tasks",
    pathOffset: 5,
    walkSpeed: 1.2,
    ownerMatch: ["ido"],
    primary: { kind: "tasks", overdueOnly: true },
    actions: [
      { label: "Overdue tasks", workbench: { kind: "tasks", overdueOnly: true } },
      { label: "All my tasks", workbench: { kind: "tasks" } },
      { label: "Today's meetings", workbench: { kind: "meetings" } },
      { label: "Classic Tasks", classic: "/sales-operation/tasks" },
    ],
  },
  {
    id: "adam",
    name: "Adam",
    role: "Growth",
    color: "#d97706",
    hair: "#57534e",
    roomId: "automation",
    pathOffset: 6,
    walkSpeed: 1.08,
    ownerMatch: ["adam"],
    primary: { kind: "discovery" },
    actions: [
      { label: "Lead Discovery", workbench: { kind: "discovery" } },
      {
        label: "Discovery → New leads",
        workbench: { kind: "leads", title: "New leads", status: "new" },
      },
      { label: "Automations UI", classic: "/sales-operation/automation" },
      { label: "Discovery UI", classic: "/sales-operation/lead-discovery" },
    ],
  },
  {
    id: "gal",
    name: "Gal",
    role: "Account Manager",
    color: "#be185d",
    hair: "#0f172a",
    roomId: "calendar",
    pathOffset: 7,
    walkSpeed: 0.98,
    ownerMatch: ["gal"],
    primary: { kind: "meetings" },
    actions: [
      { label: "Today's meetings", workbench: { kind: "meetings" } },
      { label: "My tasks", workbench: { kind: "tasks" } },
      { label: "Portfolio", classic: "/sales-operation/portfolio" },
      { label: "Tracker", classic: "/sales-operation/tracker" },
    ],
  },
];

export const OFFICE_WAYPOINTS: Array<[number, number, number]> = [
  [0, 0, 7.2],
  [2.4, 0, 5.5],
  [-2.2, 0, 5.2],
  [0, 0, 2.4],
  [-6.5, 0, 2.0],
  [-9.2, 0, 1.2],
  [-8.8, 0, -0.8],
  [-5.5, 0, 0.2],
  [6.2, 0, 1.8],
  [9.0, 0, 1.0],
  [9.2, 0, -0.6],
  [6.5, 0, 0.0],
  [-8.2, 0, -5.5],
  [-8.5, 0, -7.5],
  [0.0, 0, -5.2],
  [0.0, 0, -7.6],
  [8.2, 0, -5.4],
  [8.8, 0, -7.4],
  [3.5, 0, -2.0],
  [-3.2, 0, -2.0],
];

export function filterLeadsForWorkbench(
  stickers: Array<{
    id: string;
    title: string;
    company: string | null;
    status: SalesLeadStatus;
    ownerName: string | null;
  }>,
  mode: Extract<OfficeWorkbenchMode, { kind: "leads" }>,
) {
  return stickers.filter((s) => {
    if (mode.status && s.status !== mode.status) return false;
    if (mode.stuck && s.status !== "negotiation" && s.status !== "proposal_sent") return false;
    if (mode.ownerMatch) {
      const name = (s.ownerName ?? "").toLowerCase();
      const needle = mode.ownerMatch.toLowerCase();
      if (!name.includes(needle)) {
        // also try first token only for "igor r" vs "Igor Rebkovets"
        const tokens = needle.split(/\s+/).filter(Boolean);
        if (!tokens.every((tok) => name.includes(tok))) return false;
      }
    }
    return true;
  });
}

export function agentLiveBadge(
  agent: OfficeAgent,
  ctx: {
    newLeads: number;
    overdueTasks: number;
    meetingsToday: number;
    unread: number;
    ownerLeadCount: number;
  },
): string | null {
  switch (agent.id) {
    case "igor_k":
      return ctx.unread > 0 ? `${ctx.unread} alerts` : `${ctx.newLeads} new`;
    case "ido":
      return ctx.overdueTasks > 0 ? `${ctx.overdueTasks} overdue` : "tasks ok";
    case "gal":
      return ctx.meetingsToday > 0 ? `${ctx.meetingsToday} meets` : "calendar";
    case "egor":
      return `${ctx.newLeads} new`;
    case "adam":
      return ctx.newLeads > 0 ? `${ctx.newLeads} new` : "growth";
    default:
      return ctx.ownerLeadCount > 0 ? `${ctx.ownerLeadCount} leads` : null;
  }
}
