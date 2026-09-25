import type { DriverLeadStatus } from "@/lib/drivers-pipeline/types";

export type StatusTone = "gray" | "blue" | "green" | "red" | "yellow";

export const DRIVER_STATUS_COLUMNS: Array<{
  status: DriverLeadStatus;
  label: string;
  shortLabel?: string;
  tone: StatusTone;
}> = [
  { status: "new", label: "New", tone: "blue" },
  { status: "in_progress", label: "In Progress", shortLabel: "In progress", tone: "yellow" },
  { status: "registered", label: "Registered", tone: "green" },
  { status: "rejected", label: "Rejected", tone: "red" },
];

export function formatDriverStatus(status: DriverLeadStatus): string {
  return DRIVER_STATUS_COLUMNS.find((item) => item.status === status)?.label ?? status;
}

export function formatDriverDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDriverDateTime(iso: string): string {
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
