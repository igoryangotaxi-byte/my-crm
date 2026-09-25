import { NO_TAXI_LICENSE_SUBSTATUS } from "@/lib/drivers-pipeline/taxi-license";

/**
 * Reject reasons for Drivers Pipeline (sheet Status values → Rejected).
 * "Registered" is a board column, not a reject reason.
 */
export const DRIVER_REJECT_REASONS = [
  "Not Relevant",
  "Waiting for Docs 1",
  "Waiting for Docs 2",
  "No Answer 1",
  "No Answer 2",
  "Unreachable",
  "Already exist/blocked",
  "לא עצמאי",
  "הועבר למשה תקלה",
  "Sent to Moshe",
  NO_TAXI_LICENSE_SUBSTATUS,
] as const;

export type DriverRejectReason = (typeof DRIVER_REJECT_REASONS)[number];

export function isDriverRejectReason(value: string): value is DriverRejectReason {
  return (DRIVER_REJECT_REASONS as readonly string[]).includes(value);
}

/** Options for UI selects; keeps unknown legacy values selectable. */
export function driverRejectReasonOptions(current?: string | null): string[] {
  const cur = current?.trim() || "";
  if (cur && !isDriverRejectReason(cur)) {
    return [cur, ...DRIVER_REJECT_REASONS];
  }
  return [...DRIVER_REJECT_REASONS];
}
