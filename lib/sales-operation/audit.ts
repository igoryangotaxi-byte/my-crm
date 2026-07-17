import { getSupabaseAdminClient } from "@/lib/supabase";
import type { SalesLead } from "@/lib/sales-operation/types";

export const AUDIT_ENTITY_TYPES = ["lead", "client", "contact"] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

export const AUDIT_ACTIONS = [
  "created",
  "updated",
  "status_changed",
  "archived",
  "unarchived",
  "deleted",
  "converted",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditFieldChange = {
  from: unknown;
  to: unknown;
};

export type AuditEntry = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorUserId: string | null;
  actorName: string | null;
  summary: string | null;
  changes: Record<string, AuditFieldChange>;
  createdAt: string;
};

export type LogAuditInput = {
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actor: { userId: string | null; name: string };
  summary?: string | null;
  changes?: Record<string, AuditFieldChange>;
};

/**
 * Lead fields tracked for the audit diff. Keys are the human-facing labels used
 * in the audit summary and UI; values map to `SalesLead` properties.
 */
export const AUDIT_LEAD_FIELDS: { key: keyof SalesLead; label: string }[] = [
  { key: "fullName", label: "Name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "companyName", label: "Company" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "assignedManagerUserId", label: "Assigned manager" },
  { key: "segmentId", label: "Segment" },
  { key: "subSegment", label: "Sub-segment" },
  { key: "legalName", label: "Legal name" },
  { key: "companyRegNumber", label: "Reg. number" },
  { key: "website", label: "Website" },
  { key: "employeesCount", label: "Employees" },
  { key: "estimatedMonthlyPotential", label: "Est. monthly potential" },
  { key: "estimatedMonthlyTrips", label: "Est. monthly trips" },
  { key: "expectedCloseDate", label: "Expected close" },
  { key: "probabilityOverride", label: "Probability override" },
  { key: "clientAddress", label: "Address" },
  { key: "generalNotes", label: "General notes" },
];

function normalizeComparable(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  return value;
}

/**
 * Pure diff between two lead snapshots. Returns a map of changed fields only,
 * keyed by the human-facing label. Deterministic and side-effect free.
 */
export function diffLeadFields(
  before: SalesLead,
  after: SalesLead,
): Record<string, AuditFieldChange> {
  const changes: Record<string, AuditFieldChange> = {};
  for (const { key, label } of AUDIT_LEAD_FIELDS) {
    const from = normalizeComparable(before[key]);
    const to = normalizeComparable(after[key]);
    if (from !== to) {
      changes[label] = { from, to };
    }
  }
  return changes;
}

/** Compact one-line summary of a changes map (e.g. "Status, Email"). */
export function summarizeChanges(changes: Record<string, AuditFieldChange>): string {
  return Object.keys(changes).join(", ");
}

/** Best-effort audit logging — never throws so it cannot break core flows. */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    await supabase.from("sales_audit_log").insert({
      entity_type: input.entityType,
      entity_id: input.entityId,
      action: input.action,
      actor_user_id: input.actor.userId,
      actor_name: input.actor.name,
      summary: input.summary?.trim() || null,
      changes: input.changes ?? {},
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log sales audit entry:", error);
  }
}

function mapAuditRow(row: Record<string, unknown>): AuditEntry {
  return {
    id: String(row.id),
    entityType: (AUDIT_ENTITY_TYPES as readonly string[]).includes(String(row.entity_type))
      ? (String(row.entity_type) as AuditEntityType)
      : "lead",
    entityId: String(row.entity_id),
    action: (AUDIT_ACTIONS as readonly string[]).includes(String(row.action))
      ? (String(row.action) as AuditAction)
      : "updated",
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorName: typeof row.actor_name === "string" ? row.actor_name : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    changes:
      row.changes && typeof row.changes === "object" && !Array.isArray(row.changes)
        ? (row.changes as Record<string, AuditFieldChange>)
        : {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export type ListAuditOptions = {
  entityType?: AuditEntityType;
  entityId?: string;
  limit?: number;
};

export async function listAuditLog(options: ListAuditOptions = {}): Promise<AuditEntry[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("sales_audit_log").select("*").order("created_at", { ascending: false });
  if (options.entityType) query = query.eq("entity_type", options.entityType);
  if (options.entityId) query = query.eq("entity_id", options.entityId);
  query = query.limit(Math.min(Math.max(options.limit ?? 100, 1), 500));
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapAuditRow(row as Record<string, unknown>));
}
