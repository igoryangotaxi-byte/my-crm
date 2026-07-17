import { SALES_LEAD_STATUSES, type SalesLeadStatus } from "@/lib/sales-operation/types";

export function normalizeSalesLeadStatus(value: unknown): SalesLeadStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_LEAD_STATUSES as readonly string[]).includes(raw)
    ? (raw as SalesLeadStatus)
    : "new";
}

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

/**
 * Data-quality gates required before a lead can enter a given stage.
 * These only trigger on the transition itself, so historical records are untouched.
 */
export type StageRequirementInput = {
  estimatedMonthlyPotential?: number | null;
};

const REQUIREMENT_MESSAGES: Record<string, string> = {
  estimatedMonthlyPotential:
    "Set the estimated monthly potential (₪) before moving to this stage.",
};

export function validateStageRequirements(
  to: SalesLeadStatus,
  lead: StageRequirementInput,
): string[] {
  const missing: string[] = [];
  if (to === "proposal_sent" || to === "negotiation") {
    const potential = lead.estimatedMonthlyPotential;
    if (!(typeof potential === "number" && Number.isFinite(potential) && potential > 0)) {
      missing.push("estimatedMonthlyPotential");
    }
  }
  return missing;
}

export class StageRequirementError extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(missing.map((key) => REQUIREMENT_MESSAGES[key] ?? key).join(" "));
    this.name = "StageRequirementError";
    this.missing = missing;
  }
}

export function assertStageRequirements(to: SalesLeadStatus, lead: StageRequirementInput): void {
  const missing = validateStageRequirements(to, lead);
  if (missing.length > 0) throw new StageRequirementError(missing);
}
