import type { PreOrder } from "@/types/crm";

export type PreOrderUrgencyLevel = "green" | "yellow" | "red" | "neutral";

export const PREORDER_URGENCY_YELLOW_MAX_MINUTES = 30;
export const PREORDER_URGENCY_RED_MAX_MINUTES = 10;

export function isPreOrderDriverAssigned(preOrder: Pick<PreOrder, "driverAssigned" | "orderStatus">) {
  const status = preOrder.orderStatus?.toLowerCase() ?? "";
  const assignedStatuses = new Set([
    "driving",
    "transporting",
    "waiting",
    "pickup",
    "assigned",
  ]);
  return Boolean(preOrder.driverAssigned) || assignedStatuses.has(status);
}

export function minutesUntilScheduled(scheduledAt: string | undefined, nowMs: number): number | null {
  if (!scheduledAt) return null;
  const dueMs = new Date(scheduledAt).getTime();
  if (!Number.isFinite(dueMs)) return null;
  return (dueMs - nowMs) / 60_000;
}

/**
 * Controller urgency rail:
 * - green: driver assigned
 * - yellow: unassigned and 10–30 min to due
 * - red: unassigned and <10 min (or due already passed)
 * - neutral: unassigned and >30 min
 */
export function getPreOrderUrgencyLevel(
  preOrder: Pick<PreOrder, "driverAssigned" | "orderStatus" | "scheduledAt">,
  nowMs: number = Date.now(),
): PreOrderUrgencyLevel {
  if (isPreOrderDriverAssigned(preOrder)) {
    return "green";
  }

  const minutes = minutesUntilScheduled(preOrder.scheduledAt, nowMs);
  if (minutes == null) {
    return "neutral";
  }
  if (minutes < PREORDER_URGENCY_RED_MAX_MINUTES) {
    return "red";
  }
  if (minutes <= PREORDER_URGENCY_YELLOW_MAX_MINUTES) {
    return "yellow";
  }
  return "neutral";
}

export function getPreOrderUrgencyLabel(level: PreOrderUrgencyLevel, minutes: number | null): string {
  if (level === "green") return "Driver assigned";
  if (level === "red") {
    if (minutes != null && minutes <= 0) return "Unassigned · overdue";
    return "Unassigned · under 10 min";
  }
  if (level === "yellow") {
    const rounded = minutes == null ? null : Math.max(0, Math.round(minutes));
    return rounded == null ? "Unassigned · 10–30 min" : `Unassigned · ${rounded} min`;
  }
  if (minutes == null) return "Unassigned";
  return `Unassigned · ${Math.round(minutes)} min`;
}

export function preOrderUrgencyRailClass(level: PreOrderUrgencyLevel): string {
  switch (level) {
    case "green":
      return "border-l-[4px] border-l-emerald-500";
    case "yellow":
      return "border-l-[4px] border-l-amber-400";
    case "red":
      return "border-l-[4px] border-l-rose-500";
    default:
      return "border-l-[4px] border-l-slate-300";
  }
}

export function preOrderUrgencyTintClass(level: PreOrderUrgencyLevel): string {
  switch (level) {
    case "green":
      return "[&>td]:bg-emerald-50/40";
    case "yellow":
      return "[&>td]:bg-amber-50/50";
    case "red":
      return "[&>td]:bg-rose-50/55";
    default:
      return "[&>td]:bg-white";
  }
}

export function formatDriverDisplayName(preOrder: PreOrder): string {
  const first = (preOrder.driverFirstName ?? "").trim();
  const last = (preOrder.driverLastName ?? "").trim();
  const full = `${first} ${last}`.trim();
  if (full) return full;
  if (preOrder.driverAssigned || preOrder.driverId || preOrder.driverPhone) {
    return "Unknown Driver";
  }
  return "Not assigned";
}
