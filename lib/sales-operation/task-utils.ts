import {
  SALES_TASK_PRIORITIES,
  SALES_TASK_STATUSES,
  SALES_TASK_TYPES,
  type SalesTask,
  type SalesTaskPriority,
  type SalesTaskStatus,
  type SalesTaskType,
} from "@/lib/sales-operation/types";

export function normalizeTaskStatus(value: unknown): SalesTaskStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_TASK_STATUSES as readonly string[]).includes(raw)
    ? (raw as SalesTaskStatus)
    : "open";
}

export function normalizeTaskType(value: unknown): SalesTaskType | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_TASK_TYPES as readonly string[]).includes(raw) ? (raw as SalesTaskType) : null;
}

export function normalizeTaskPriority(value: unknown): SalesTaskPriority {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_TASK_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as SalesTaskPriority)
    : "normal";
}

export type TaskDueBucket = "overdue" | "today" | "upcoming" | "no_due" | "done";

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function taskDueBucket(
  task: Pick<SalesTask, "status" | "dueAt">,
  now: Date = new Date(),
): TaskDueBucket {
  if (task.status !== "open") return "done";
  if (!task.dueAt) return "no_due";
  const due = new Date(task.dueAt);
  if (Number.isNaN(due.getTime())) return "no_due";
  const todayStart = startOfDay(now);
  const dueStart = startOfDay(due);
  if (dueStart < todayStart) return "overdue";
  if (dueStart === todayStart) return "today";
  return "upcoming";
}

export function isTaskOverdue(
  task: Pick<SalesTask, "status" | "dueAt">,
  now: Date = new Date(),
): boolean {
  return taskDueBucket(task, now) === "overdue";
}

const PRIORITY_WEIGHT: Record<SalesTaskPriority, number> = { high: 0, normal: 1, low: 2 };

/** Open tasks first, then by soonest due date, then by priority. */
export function sortTasks<T extends Pick<SalesTask, "status" | "dueAt" | "priority" | "createdAt">>(
  tasks: T[],
): T[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) {
      if (a.status === "open") return -1;
      if (b.status === "open") return 1;
    }
    const aDue = a.dueAt ? new Date(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.dueAt ? new Date(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDue !== bDue) return aDue - bDue;
    const aPrio = PRIORITY_WEIGHT[a.priority] ?? 1;
    const bPrio = PRIORITY_WEIGHT[b.priority] ?? 1;
    if (aPrio !== bPrio) return aPrio - bPrio;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}
