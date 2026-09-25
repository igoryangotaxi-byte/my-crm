import {
  DRIVER_LEAD_STATUSES,
  type DriverLeadStatus,
} from "@/lib/drivers-pipeline/types";

const STATUS_SET = new Set<string>(DRIVER_LEAD_STATUSES);

export function isDriverLeadStatus(value: unknown): value is DriverLeadStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

/** Any status may move to any other (recruitment board; no B2B stage gates). */
export function assertValidDriverStatusTransition(
  from: DriverLeadStatus,
  to: DriverLeadStatus,
): void {
  if (!isDriverLeadStatus(to)) {
    throw new Error(`Invalid status: ${String(to)}`);
  }
  if (from === to) return;
}
