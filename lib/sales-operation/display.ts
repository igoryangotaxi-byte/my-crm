import type { SalesLeadStatus } from "@/lib/sales-operation/types";

export const SALES_STATUS_COLUMNS: Array<{
  status: SalesLeadStatus;
  label: string;
  shortLabel?: string;
  tone: "gray" | "blue" | "green" | "red" | "yellow";
}> = [
  { status: "new", label: "New", tone: "blue" },
  { status: "in_progress", label: "In Progress", shortLabel: "In progress", tone: "gray" },
  { status: "proposal_sent", label: "Proposal Sent", shortLabel: "Proposal", tone: "yellow" },
  { status: "signed", label: "Signed", tone: "green" },
  { status: "rejected", label: "Rejected", tone: "red" },
];

export function formatSalesStatus(status: SalesLeadStatus): string {
  return SALES_STATUS_COLUMNS.find((item) => item.status === status)?.label ?? status;
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
