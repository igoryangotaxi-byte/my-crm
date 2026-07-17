import type { Edge, Node } from "@xyflow/react";
import type { SalesLeadStatus } from "@/lib/sales-operation/types";
import type {
  ActionAssignManagerData,
  ActionCreateTaskData,
  ActionSmsData,
  StatusMatch,
  TriggerLeadStatusData,
} from "@/lib/sales-operation/automation/types";
import { isAutomationNodeType } from "@/lib/sales-operation/automation/types";

export function statusMatches(match: StatusMatch, status: SalesLeadStatus): boolean {
  return match === "*" || match === status;
}

export function triggerMatches(
  data: TriggerLeadStatusData,
  fromStatus: SalesLeadStatus,
  toStatus: SalesLeadStatus,
): boolean {
  return statusMatches(data.fromStatus ?? "*", fromStatus) && statusMatches(data.toStatus ?? "*", toStatus);
}

export function getOutgoingTargets(edges: Edge[], nodeId: string): string[] {
  return edges
    .filter((edge) => edge.source === nodeId)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((edge) => edge.target);
}

/** BFS walk from trigger; returns action nodes in execution order (skips triggers). */
export function walkActionNodes(
  nodes: Node[],
  edges: Edge[],
  triggerNodeId: string,
): Node[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const queue = [...getOutgoingTargets(edges, triggerNodeId)];
  const ordered: Node[] = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id || visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (!node) continue;
    if (isAutomationNodeType(node.type) && node.type !== "triggerLeadStatus") {
      ordered.push(node);
    }
    queue.push(...getOutgoingTargets(edges, id));
  }

  return ordered;
}

export function findMatchingTriggers(
  nodes: Node[],
  fromStatus: SalesLeadStatus,
  toStatus: SalesLeadStatus,
): Node[] {
  return nodes.filter((node) => {
    if (node.type !== "triggerLeadStatus") return false;
    const data = (node.data ?? {}) as TriggerLeadStatusData;
    return triggerMatches(
      {
        fromStatus: (data.fromStatus as StatusMatch) ?? "*",
        toStatus: (data.toStatus as StatusMatch) ?? "*",
      },
      fromStatus,
      toStatus,
    );
  });
}

export function readSmsData(node: Node): ActionSmsData {
  const data = (node.data ?? {}) as ActionSmsData;
  return {
    text: typeof data.text === "string" ? data.text : "",
  };
}

export function readAssignData(node: Node): ActionAssignManagerData {
  const data = (node.data ?? {}) as ActionAssignManagerData;
  const mode = data.mode === "round_robin" ? "round_robin" : "fixed";
  return {
    mode,
    userId: typeof data.userId === "string" ? data.userId : undefined,
    userName: typeof data.userName === "string" ? data.userName : undefined,
    userIds: Array.isArray(data.userIds)
      ? data.userIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [],
    userNames:
      data.userNames && typeof data.userNames === "object" && !Array.isArray(data.userNames)
        ? (data.userNames as Record<string, string>)
        : {},
  };
}

const TASK_TYPES = ["call", "email", "meeting", "whatsapp", "todo", "other"] as const;
const TASK_PRIORITIES = ["low", "normal", "high"] as const;

export function readCreateTaskData(node: Node): Required<
  Pick<ActionCreateTaskData, "title" | "taskType" | "priority" | "dueInDays" | "assignToLeadOwner">
> {
  const data = (node.data ?? {}) as ActionCreateTaskData;
  const taskType = (TASK_TYPES as readonly string[]).includes(data.taskType ?? "")
    ? (data.taskType as (typeof TASK_TYPES)[number])
    : "todo";
  const priority = (TASK_PRIORITIES as readonly string[]).includes(data.priority ?? "")
    ? (data.priority as (typeof TASK_PRIORITIES)[number])
    : "normal";
  const dueInDays =
    typeof data.dueInDays === "number" && Number.isFinite(data.dueInDays) && data.dueInDays >= 0
      ? Math.floor(data.dueInDays)
      : 1;
  return {
    title: typeof data.title === "string" ? data.title : "",
    taskType,
    priority,
    dueInDays,
    assignToLeadOwner: data.assignToLeadOwner !== false,
  };
}

export function pickRoundRobinUser(
  userIds: string[],
  cursor: number,
): { userId: string; nextCursor: number } | null {
  if (userIds.length === 0) return null;
  const index = ((cursor % userIds.length) + userIds.length) % userIds.length;
  return { userId: userIds[index]!, nextCursor: index + 1 };
}
