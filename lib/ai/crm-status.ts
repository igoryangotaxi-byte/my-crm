import { SALES_STATUS_COLUMNS } from "@/lib/sales-operation/display";
import { SALES_LEAD_STATUSES, type SalesLeadStatus } from "@/lib/sales-operation/types";

/**
 * The model is given canonical status keys, but users speak in board labels and
 * in Russian/Hebrew. Resolving here keeps the assistant from asking the user to
 * "provide the exact status name".
 */
const STATUS_ALIASES: Record<SalesLeadStatus, readonly string[]> = {
  new: ["new", "lead", "inbox", "новый", "новая", "новые", "חדש"],
  in_progress: [
    "in progress",
    "inprogress",
    "progress",
    "working",
    "work",
    "active",
    "wip",
    "в работе",
    "работа",
    "взять в работу",
    "בתהליך",
  ],
  proposal_sent: [
    "proposal sent",
    "proposal",
    "proposal send",
    "offer",
    "offer sent",
    "quote",
    "quoted",
    "предложение",
    "предложение отправлено",
    "оффер",
    "коммерческое",
    "הצעה נשלחה",
  ],
  negotiation: [
    "negotiation",
    "negotiations",
    "negotiating",
    "переговоры",
    "согласование",
    "משא ומתן",
  ],
  signed: ["signed", "sign", "won", "closed won", "close won", "подписан", "подписано", "подписали", "נחתם"],
  rejected: [
    "rejected",
    "reject",
    "declined",
    "lost",
    "closed lost",
    "close lost",
    "отказ",
    "отклонен",
    "отклонён",
    "проигран",
    "נדחה",
  ],
};

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\s+/g, " ");
}

const LOOKUP: Map<string, SalesLeadStatus> = (() => {
  const map = new Map<string, SalesLeadStatus>();
  for (const status of SALES_LEAD_STATUSES) {
    map.set(normalize(status), status);
    for (const alias of STATUS_ALIASES[status]) map.set(normalize(alias), status);
  }
  for (const column of SALES_STATUS_COLUMNS) {
    map.set(normalize(column.label), column.status);
    if (column.shortLabel) map.set(normalize(column.shortLabel), column.status);
  }
  return map;
})();

export function resolveLeadStatus(value: unknown): SalesLeadStatus | null {
  if (typeof value !== "string") return null;
  const key = normalize(value);
  if (!key) return null;
  return LOOKUP.get(key) ?? null;
}

export function leadStatusLabel(status: SalesLeadStatus): string {
  return SALES_STATUS_COLUMNS.find((column) => column.status === status)?.label ?? status;
}

/** Compact vocabulary for the system prompt so the model never invents a status. */
export function describeLeadStatuses(): string {
  return SALES_STATUS_COLUMNS.map((column) => `${column.status} (${column.label})`).join(", ");
}
