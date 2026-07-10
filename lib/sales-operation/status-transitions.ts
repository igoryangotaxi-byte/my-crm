import type { SalesLeadStatus } from "@/lib/sales-operation/types";

/** Signed leads are terminal — they cannot move to another status. */
const TERMINAL_STATUSES = new Set<SalesLeadStatus>(["signed"]);

export function isValidStatusTransition(from: SalesLeadStatus, to: SalesLeadStatus): boolean {
  if (from === to) return true;
  if (TERMINAL_STATUSES.has(from)) return false;
  if (from === "new" && (to === "signed" || to === "rejected")) return false;
  return true;
}

export function assertValidStatusTransition(from: SalesLeadStatus, to: SalesLeadStatus): void {
  if (!isValidStatusTransition(from, to)) {
    throw new Error(`Invalid status transition from "${from}" to "${to}".`);
  }
}
