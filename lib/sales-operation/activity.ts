import {
  SALES_ACTIVITY_TYPES,
  type SalesActivity,
  type SalesActivityType,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeType(value: unknown): SalesActivityType {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_ACTIVITY_TYPES as readonly string[]).includes(raw)
    ? (raw as SalesActivityType)
    : "other";
}

function mapActivityRow(row: Record<string, unknown>): SalesActivity {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    type: normalizeType(row.type),
    title: readText(row.title),
    body: readText(row.body),
    meta:
      row.meta && typeof row.meta === "object" && !Array.isArray(row.meta)
        ? (row.meta as Record<string, unknown>)
        : {},
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorName: typeof row.actor_name === "string" ? row.actor_name : null,
    occurredAt: String(row.occurred_at ?? row.created_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export type LogActivityInput = {
  leadId: string;
  type: SalesActivityType;
  title?: string | null;
  body?: string | null;
  meta?: Record<string, unknown>;
  occurredAt?: string;
  actor: { userId: string | null; name: string };
};

/** Best-effort activity logging — never throws so it cannot break core flows. */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date().toISOString();
    await supabase.from("sales_activities").insert({
      lead_id: input.leadId,
      type: input.type,
      title: input.title?.trim() || null,
      body: input.body?.trim() || null,
      meta: input.meta ?? {},
      actor_user_id: input.actor.userId,
      actor_name: input.actor.name,
      occurred_at: input.occurredAt ?? now,
      created_at: now,
    });
  } catch (error) {
    console.error("Failed to log sales activity:", error);
  }
}

export async function createManualActivity(
  input: LogActivityInput,
): Promise<SalesActivity | null> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_activities")
    .insert({
      lead_id: input.leadId,
      type: input.type,
      title: input.title?.trim() || null,
      body: input.body?.trim() || null,
      meta: input.meta ?? {},
      actor_user_id: input.actor.userId,
      actor_name: input.actor.name,
      occurred_at: input.occurredAt ?? now,
      created_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to log activity.");
  return mapActivityRow(data as Record<string, unknown>);
}

/**
 * Unified, chronological activity feed for a lead.
 * Merges explicit activities with existing notes, status events and tasks so the
 * timeline is complete even for records created before Phase 4.
 */
export async function getLeadActivityFeed(leadId: string): Promise<SalesActivity[]> {
  const supabase = getSupabaseAdminClient();
  const feed: SalesActivity[] = [];

  const [activities, notes, statusEvents, tasks, audit] = await Promise.all([
    supabase.from("sales_activities").select("*").eq("lead_id", leadId),
    supabase.from("sales_lead_notes").select("*").eq("lead_id", leadId),
    supabase.from("sales_lead_status_events").select("*").eq("lead_id", leadId),
    supabase.from("sales_tasks").select("*").eq("lead_id", leadId),
    supabase
      .from("sales_audit_log")
      .select("*")
      .eq("entity_type", "lead")
      .eq("entity_id", leadId)
      .in("action", ["updated", "archived", "unarchived"]),
  ]);

  for (const row of activities.data ?? []) {
    feed.push(mapActivityRow(row as Record<string, unknown>));
  }

  for (const row of (notes.data ?? []) as Record<string, unknown>[]) {
    feed.push({
      id: `note:${String(row.id)}`,
      leadId,
      type: "note",
      title: null,
      body: readText(row.body),
      meta: {},
      actorUserId: typeof row.author_user_id === "string" ? row.author_user_id : null,
      actorName: readText(row.author_name) ?? "System",
      occurredAt: String(row.created_at ?? new Date().toISOString()),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    });
  }

  for (const row of (statusEvents.data ?? []) as Record<string, unknown>[]) {
    feed.push({
      id: `status:${String(row.id)}`,
      leadId,
      type: "status_changed",
      title: null,
      body: null,
      meta: { fromStatus: row.from_status ?? null, toStatus: row.to_status ?? null },
      actorUserId: typeof row.changed_by_user_id === "string" ? row.changed_by_user_id : null,
      actorName: readText(row.changed_by_name) ?? "System",
      occurredAt: String(row.created_at ?? new Date().toISOString()),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    });
  }

  for (const row of (tasks.data ?? []) as Record<string, unknown>[]) {
    const title = readText(row.title);
    feed.push({
      id: `task-created:${String(row.id)}`,
      leadId,
      type: "task_created",
      title,
      body: null,
      meta: { taskId: String(row.id), taskType: row.task_type ?? null },
      actorUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
      actorName: readText(row.created_by_name) ?? "System",
      occurredAt: String(row.created_at ?? new Date().toISOString()),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    });
    if (row.status === "done" && row.completed_at) {
      feed.push({
        id: `task-completed:${String(row.id)}`,
        leadId,
        type: "task_completed",
        title,
        body: null,
        meta: { taskId: String(row.id) },
        actorUserId:
          typeof row.completed_by_user_id === "string" ? row.completed_by_user_id : null,
        actorName: readText(row.completed_by_name) ?? "System",
        occurredAt: String(row.completed_at),
        createdAt: String(row.completed_at),
      });
    }
  }

  for (const row of (audit.data ?? []) as Record<string, unknown>[]) {
    const action = String(row.action ?? "updated");
    feed.push({
      id: `audit:${String(row.id)}`,
      leadId,
      type: "field_changed",
      title: readText(row.summary),
      body: null,
      meta: {
        action,
        changes:
          row.changes && typeof row.changes === "object" && !Array.isArray(row.changes)
            ? (row.changes as Record<string, unknown>)
            : {},
      },
      actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
      actorName: readText(row.actor_name) ?? "System",
      occurredAt: String(row.created_at ?? new Date().toISOString()),
      createdAt: String(row.created_at ?? new Date().toISOString()),
    });
  }

  feed.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  return feed;
}
