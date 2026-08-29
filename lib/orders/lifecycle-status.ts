import type { B2BDashboardOrder } from "@/types/crm";

export type OrdersStatusBucket = "completed" | "cancelled" | "in_progress" | "pending";

export type OrdersStatusTone = "completed" | "cancelled" | "in_progress" | "neutral";

/**
 * Map Yango B2B order status → operator bucket.
 * Order of checks matters: transporting_finished must win over transporting.
 */
export function resolveOrdersStatusBucket(
  row: Pick<B2BDashboardOrder, "statusRaw" | "scheduledAt">,
  nowMs: number = Date.now(),
): OrdersStatusBucket {
  const raw = (row.statusRaw ?? "").trim().toLowerCase();

  if (!raw) {
    const scheduledTs = new Date(row.scheduledAt).getTime();
    if (Number.isFinite(scheduledTs) && scheduledTs > nowMs) return "pending";
    return "pending";
  }

  if (raw.includes("cancel")) return "cancelled";

  if (
    raw.includes("transporting_finished") ||
    raw.includes("complete") ||
    (raw.includes("finished") && !raw.includes("unfinished"))
  ) {
    return "completed";
  }

  if (
    raw.includes("search") ||
    raw.includes("driving") ||
    raw.includes("transporting") ||
    raw.includes("waiting") ||
    raw.includes("arriv") ||
    raw.includes("pickup") ||
    raw.includes("accepted") ||
    raw.includes("assigned") ||
    raw.includes("in_progress") ||
    raw.includes("in-progress") ||
    raw === "busy"
  ) {
    return "in_progress";
  }

  if (raw.includes("schedul")) return "pending";

  const scheduledTs = new Date(row.scheduledAt).getTime();
  if (Number.isFinite(scheduledTs) && scheduledTs > nowMs) return "pending";

  return "pending";
}

export function getOrdersStatusDisplay(
  row: Pick<B2BDashboardOrder, "statusRaw" | "scheduledAt">,
  nowMs: number = Date.now(),
): { label: string; tone: OrdersStatusTone; bucket: OrdersStatusBucket; raw: string } {
  const bucket = resolveOrdersStatusBucket(row, nowMs);
  const raw = (row.statusRaw ?? "").trim();
  const rawShort = raw || "—";

  if (bucket === "completed") {
    return { label: "Completed", tone: "completed", bucket, raw: rawShort };
  }
  if (bucket === "cancelled") {
    return { label: "Canceled", tone: "cancelled", bucket, raw: rawShort };
  }
  if (bucket === "in_progress") {
    return {
      label: raw && !/^in[_\s-]?progress$/i.test(raw) ? `In progress · ${raw}` : "In progress",
      tone: "in_progress",
      bucket,
      raw: rawShort,
    };
  }
  return {
    label: raw ? raw : "Pending",
    tone: "neutral",
    bucket,
    raw: rawShort,
  };
}

export function ordersStatusRailClass(tone: OrdersStatusTone): string {
  switch (tone) {
    case "completed":
      return "border-l-[4px] border-l-emerald-500";
    case "cancelled":
      return "border-l-[4px] border-l-rose-500";
    case "in_progress":
      return "border-l-[4px] border-l-sky-500";
    default:
      return "border-l-[4px] border-l-slate-300";
  }
}

export function ordersStatusTintClass(tone: OrdersStatusTone): string {
  switch (tone) {
    case "completed":
      return "[&>td]:bg-emerald-50/50";
    case "cancelled":
      return "[&>td]:bg-rose-50/45";
    case "in_progress":
      return "[&>td]:bg-sky-50/55";
    default:
      return "[&>td]:bg-slate-50/40";
  }
}
