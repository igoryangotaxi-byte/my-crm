import type { PipelineStage, SalesLead, SalesLeadStatus } from "@/lib/sales-operation/types";

export type StatusTone = "gray" | "blue" | "green" | "red" | "yellow";

export const SALES_STATUS_COLUMNS: Array<{
  status: SalesLeadStatus;
  label: string;
  shortLabel?: string;
  tone: StatusTone;
}> = [
  { status: "new", label: "New", tone: "blue" },
  { status: "in_progress", label: "In Progress", shortLabel: "In progress", tone: "gray" },
  { status: "proposal_sent", label: "Proposal Sent", shortLabel: "Proposal", tone: "yellow" },
  { status: "negotiation", label: "Negotiation", shortLabel: "Negotiation", tone: "yellow" },
  { status: "signed", label: "Signed", tone: "green" },
  { status: "rejected", label: "Rejected", shortLabel: "Rejected", tone: "red" },
];

/** Default stage probabilities (%) used until an admin overrides them via settings. */
export const DEFAULT_STAGE_PROBABILITY: Record<SalesLeadStatus, number> = {
  new: 10,
  in_progress: 30,
  proposal_sent: 50,
  negotiation: 70,
  signed: 100,
  rejected: 0,
};

/** Fallback pipeline stages (used before the config table is populated). */
export function defaultPipelineStages(): PipelineStage[] {
  return SALES_STATUS_COLUMNS.map((column, index) => ({
    key: column.status,
    label: column.label,
    orderIndex: index,
    probability: DEFAULT_STAGE_PROBABILITY[column.status] ?? 0,
    isWon: column.status === "signed",
    isLost: column.status === "rejected",
    isTerminal: column.status === "signed",
    isActive: true,
    color: null,
  }));
}

export function formatSalesStatus(status: SalesLeadStatus): string {
  return SALES_STATUS_COLUMNS.find((item) => item.status === status)?.label ?? status;
}

/** Weighted pipeline value = estimated potential × probability of closing. */
export function computeWeightedPipelineValue(
  lead: Pick<SalesLead, "estimatedMonthlyPotential" | "probabilityOverride" | "status">,
  stageProbabilityByKey?: Record<string, number>,
): number {
  const potential = lead.estimatedMonthlyPotential ?? 0;
  if (potential <= 0) return 0;
  const probability =
    lead.probabilityOverride ??
    stageProbabilityByKey?.[lead.status] ??
    DEFAULT_STAGE_PROBABILITY[lead.status] ??
    0;
  return Math.round((potential * probability) / 100);
}

export function formatSalesDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatSalesDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
