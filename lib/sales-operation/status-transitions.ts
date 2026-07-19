import { SALES_LEAD_STATUSES, type SalesLeadStatus } from "@/lib/sales-operation/types";

export function normalizeSalesLeadStatus(value: unknown): SalesLeadStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_LEAD_STATUSES as readonly string[]).includes(raw)
    ? (raw as SalesLeadStatus)
    : "new";
}

/** Signed leads are terminal — they cannot move to another status. */
const TERMINAL_STATUSES = new Set<SalesLeadStatus>(["signed"]);

/** Forward pipeline order used for commercial stage gates. */
export const STAGE_ORDER: SalesLeadStatus[] = [
  "new",
  "in_progress",
  "proposal_sent",
  "negotiation",
  "signed",
];

export function stageIndex(status: SalesLeadStatus): number {
  return STAGE_ORDER.indexOf(status);
}

export function isForwardTransition(from: SalesLeadStatus, to: SalesLeadStatus): boolean {
  if (to === "rejected") return false;
  const fromIdx = stageIndex(from);
  const toIdx = stageIndex(to);
  if (fromIdx < 0 || toIdx < 0) return false;
  return toIdx > fromIdx;
}

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

export type StageMissingField = {
  key: string;
  label: string;
};

export type StageRequirementContext = {
  estimatedMonthlyPotential?: number | null;
  pricingProposal?: string | null;
  contractNumber?: string | null;
  corpClientId?: string | null;
  /** True when lead has reachable contact (active contact or lead email/phone + name). */
  hasContact?: boolean;
  /** True when a follow-up task is being created as part of this transition. */
  followUpTaskProvided?: boolean;
  /** Account manager selected for Signed transition. */
  accountManagerUserId?: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  contact: "Client contact person & details",
  estimatedMonthlyPotential: "Monthly potential (₪)",
  pricingProposal: "Pricing / proposal sent to client",
  followUpTask: "Follow-up with client task",
  contractOrClientId: "Contract number or Client ID",
  accountManager: "Account Manager",
};

/**
 * Evaluate commercial stage gates for a forward transition.
 * Returns missing field keys (empty = ok).
 */
export function validateStageRequirements(
  from: SalesLeadStatus,
  to: SalesLeadStatus,
  ctx: StageRequirementContext,
): string[] {
  if (!isForwardTransition(from, to) && to !== "rejected") {
    // Same stage or backward — no commercial gates.
    if (from === to) return [];
    if (!isForwardTransition(from, to)) return [];
  }
  if (!isForwardTransition(from, to)) return [];

  const missing: string[] = [];
  const toIdx = stageIndex(to);

  // Gates accumulate for skips: entering a stage requires all gates up to that stage.
  if (toIdx >= stageIndex("in_progress")) {
    if (!ctx.hasContact) missing.push("contact");
    const potential = ctx.estimatedMonthlyPotential;
    if (!(typeof potential === "number" && Number.isFinite(potential) && potential > 0)) {
      missing.push("estimatedMonthlyPotential");
    }
  }
  if (toIdx >= stageIndex("proposal_sent")) {
    if (!(typeof ctx.pricingProposal === "string" && ctx.pricingProposal.trim())) {
      missing.push("pricingProposal");
    }
  }
  if (toIdx >= stageIndex("negotiation") && to === "negotiation") {
    // Follow-up required specifically when entering negotiation.
    if (!ctx.followUpTaskProvided) missing.push("followUpTask");
  }
  if (to === "signed") {
    const hasContract = Boolean(ctx.contractNumber?.trim());
    const hasClientId = Boolean(ctx.corpClientId?.trim());
    if (!hasContract && !hasClientId) missing.push("contractOrClientId");
    if (!ctx.accountManagerUserId?.trim()) missing.push("accountManager");
  }

  return missing;
}

export class StageRequirementError extends Error {
  readonly missing: StageMissingField[];
  constructor(missingKeys: string[]) {
    const fields = missingKeys.map((key) => ({
      key,
      label: FIELD_LABELS[key] ?? key,
    }));
    super(fields.map((f) => f.label).join(". ") + ".");
    this.name = "StageRequirementError";
    this.missing = fields;
  }
}

export function assertStageRequirements(
  from: SalesLeadStatus,
  to: SalesLeadStatus,
  ctx: StageRequirementContext,
): void {
  const missing = validateStageRequirements(from, to, ctx);
  if (missing.length > 0) throw new StageRequirementError(missing);
}
