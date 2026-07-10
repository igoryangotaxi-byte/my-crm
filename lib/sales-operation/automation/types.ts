import type { Edge, Node, Viewport } from "@xyflow/react";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";

export const AUTOMATION_NODE_TYPES = [
  "triggerLeadStatus",
  "actionSms",
  "actionAssignManager",
] as const;
export type AutomationNodeType = (typeof AUTOMATION_NODE_TYPES)[number];

export type StatusMatch = SalesLeadStatus | "*";

export type TriggerLeadStatusData = {
  label?: string;
  fromStatus: StatusMatch;
  toStatus: StatusMatch;
};

export type ActionSmsData = {
  label?: string;
  text: string;
};

export type ActionAssignManagerData = {
  label?: string;
  mode: "fixed" | "round_robin";
  userId?: string;
  userName?: string;
  userIds?: string[];
  userNames?: Record<string, string>;
};

export type AutomationNodeData =
  | TriggerLeadStatusData
  | ActionSmsData
  | ActionAssignManagerData;

export type AutomationGraph = {
  nodes: Node[];
  edges: Edge[];
  viewport?: Viewport;
};

export type SalesAutomation = {
  id: string;
  name: string;
  enabled: boolean;
  graph: AutomationGraph;
  roundRobinState: Record<string, number>;
  createdByUserId: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SalesAutomationListItem = Pick<
  SalesAutomation,
  "id" | "name" | "enabled" | "createdAt" | "updatedAt"
>;

export type AutomationRunStep = {
  nodeId: string;
  type: string;
  ok: boolean;
  skipped?: boolean;
  message?: string;
};

export type AutomationRunStatus = "ok" | "partial" | "error";

export function emptyAutomationGraph(): AutomationGraph {
  return {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

export function isAutomationNodeType(value: unknown): value is AutomationNodeType {
  return typeof value === "string" && (AUTOMATION_NODE_TYPES as readonly string[]).includes(value);
}
