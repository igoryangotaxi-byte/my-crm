import { createNotification } from "@/lib/sales-operation/notifications";
import {
  normalizeTaskPriority,
  normalizeTaskStatus,
  normalizeTaskType,
} from "@/lib/sales-operation/task-utils";
import { normalizeSalesLeadStatus } from "@/lib/sales-operation/status-transitions";
import type {
  CreateSalesTaskInput,
  SalesTask,
  SalesTaskEvent,
  SalesTaskEventType,
  SalesTaskStatus,
  SalesTaskWithLead,
  UpdateSalesTaskInput,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapTaskRow(row: Record<string, unknown>): SalesTask {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    title: String(row.title ?? ""),
    description: readText(row.description),
    taskType: normalizeTaskType(row.task_type),
    status: normalizeTaskStatus(row.status),
    priority: normalizeTaskPriority(row.priority),
    dueAt: readText(row.due_at),
    assignedToUserId: typeof row.assigned_to_user_id === "string" ? row.assigned_to_user_id : null,
    assignedToName: readText(row.assigned_to_name),
    completedAt: readText(row.completed_at),
    completedByUserId:
      typeof row.completed_by_user_id === "string" ? row.completed_by_user_id : null,
    completedByName: readText(row.completed_by_name),
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: readText(row.created_by_name),
    resultSummary: readText(row.result_summary),
    parentTaskId: typeof row.parent_task_id === "string" ? row.parent_task_id : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapEventRow(row: Record<string, unknown>): SalesTaskEvent {
  const changes =
    row.changes && typeof row.changes === "object" && !Array.isArray(row.changes)
      ? (row.changes as Record<string, unknown>)
      : null;
  return {
    id: String(row.id),
    taskId: String(row.task_id),
    leadId: typeof row.lead_id === "string" ? row.lead_id : null,
    eventType: String(row.event_type ?? "updated") as SalesTaskEventType,
    body: readText(row.body),
    changes,
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorName: String(row.actor_name ?? "System"),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

async function appendTaskEvent(input: {
  taskId: string;
  leadId: string | null;
  eventType: SalesTaskEventType;
  body?: string | null;
  changes?: Record<string, unknown> | null;
  actor: { userId: string | null; name: string };
}): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_task_events").insert({
    task_id: input.taskId,
    lead_id: input.leadId,
    event_type: input.eventType,
    body: input.body?.trim() || null,
    changes: input.changes ?? null,
    actor_user_id: input.actor.userId,
    actor_name: input.actor.name,
  });
  if (error) {
    // Events table may be missing before migration; don't fail the primary write.
    console.error("Failed to write sales_task_event:", error.message);
  }
}

export async function listSalesTasks(leadId: string): Promise<SalesTask[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_tasks")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTaskRow(row as Record<string, unknown>));
}

export async function countOpenTasksForLead(leadId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { count, error } = await supabase
    .from("sales_tasks")
    .select("id", { count: "exact", head: true })
    .eq("lead_id", leadId)
    .eq("status", "open");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getSalesTaskById(taskId: string): Promise<SalesTaskWithLead | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_tasks")
    .select("*, lead:sales_leads(full_name, company_name, status, assigned_manager_user_id)")
    .eq("id", taskId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return mapTaskWithLeadRow(data as Record<string, unknown>);
}

export function canAccessSalesTask(
  task: SalesTask & { leadAssignedManagerUserId?: string | null },
  user: { id: string; role?: string | null },
): boolean {
  if (user.role === "Admin") return true;
  if (task.assignedToUserId === user.id) return true;
  if (task.createdByUserId === user.id) return true;
  if (task.leadAssignedManagerUserId && task.leadAssignedManagerUserId === user.id) return true;
  return false;
}

export async function listTaskEvents(taskId: string): Promise<SalesTaskEvent[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_task_events")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) {
    // Table may not exist yet.
    console.error("Failed to list task events:", error.message);
    return [];
  }
  return (data ?? []).map((row) => mapEventRow(row as Record<string, unknown>));
}

export async function listFollowUpChain(taskId: string): Promise<SalesTask[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_tasks")
    .select("*")
    .or(`id.eq.${taskId},parent_task_id.eq.${taskId}`)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTaskRow(row as Record<string, unknown>));
}

export async function createSalesTask(
  leadId: string,
  input: CreateSalesTaskInput,
  actor: { userId: string | null; name: string },
): Promise<SalesTask> {
  const supabase = getSupabaseAdminClient();
  const title = input.title?.trim();
  if (!title) throw new Error("Task title is required.");

  const { data: lead, error: leadError } = await supabase
    .from("sales_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found.");

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    lead_id: leadId,
    title,
    description: input.description?.trim() || null,
    task_type: normalizeTaskType(input.taskType),
    status: "open",
    priority: normalizeTaskPriority(input.priority),
    due_at: input.dueAt?.trim() || null,
    assigned_to_user_id: input.assignedToUserId || null,
    assigned_to_name: input.assignedToUserId
      ? input.assignedToName?.trim() || input.assignedToUserId
      : null,
    parent_task_id: input.parentTaskId || null,
    created_by_user_id: actor.userId,
    created_by_name: actor.name,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("sales_tasks")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create task.");
  const task = mapTaskRow(data as Record<string, unknown>);

  await appendTaskEvent({
    taskId: task.id,
    leadId,
    eventType: input.parentTaskId ? "follow_up_created" : "created",
    body: input.parentTaskId ? `Follow-up of ${input.parentTaskId}` : "Task created",
    actor,
  });

  if (task.assignedToUserId && task.assignedToUserId !== actor.userId) {
    await createNotification({
      userId: task.assignedToUserId,
      type: "task_assigned",
      title: `New task: ${task.title}`,
      body: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString()}` : null,
      leadId,
      link: `/sales-operation/tasks?task=${task.id}&kind=lead`,
    });
  }

  return task;
}

export async function createFollowUpTask(
  parentTaskId: string,
  input: CreateSalesTaskInput,
  actor: { userId: string | null; name: string },
): Promise<SalesTask> {
  const parent = await getSalesTaskById(parentTaskId);
  if (!parent) throw new Error("Parent task not found.");
  return createSalesTask(
    parent.leadId,
    {
      ...input,
      parentTaskId,
      title: input.title?.trim() || `Follow-up: ${parent.title}`,
    },
    actor,
  );
}

export async function updateSalesTask(
  taskId: string,
  input: UpdateSalesTaskInput,
  actor: { userId: string | null; name: string },
): Promise<SalesTask> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("sales_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Task not found.");
  const prev = mapTaskRow(existing as Record<string, unknown>);

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { updated_at: now };

  if (input.title !== undefined) {
    const trimmed = input.title?.trim();
    if (!trimmed) throw new Error("Task title is required.");
    payload.title = trimmed;
  }
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.taskType !== undefined) payload.task_type = normalizeTaskType(input.taskType);
  if (input.priority !== undefined) payload.priority = normalizeTaskPriority(input.priority);
  if (input.dueAt !== undefined) payload.due_at = input.dueAt?.trim() || null;
  if (input.resultSummary !== undefined) {
    payload.result_summary = input.resultSummary?.trim() || null;
  }
  if (input.assignedToUserId !== undefined) {
    payload.assigned_to_user_id = input.assignedToUserId || null;
    payload.assigned_to_name = input.assignedToUserId
      ? input.assignedToName?.trim() || input.assignedToUserId
      : null;
  } else if (input.assignedToName !== undefined) {
    payload.assigned_to_name = input.assignedToName?.trim() || null;
  }

  if (input.status !== undefined) {
    const nextStatus: SalesTaskStatus = normalizeTaskStatus(input.status);
    payload.status = nextStatus;
    if (nextStatus === "done") {
      payload.completed_at = now;
      payload.completed_by_user_id = actor.userId;
      payload.completed_by_name = actor.name;
    } else {
      payload.completed_at = null;
      payload.completed_by_user_id = null;
      payload.completed_by_name = null;
    }
  }

  const { data, error } = await supabase
    .from("sales_tasks")
    .update(payload)
    .eq("id", taskId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update task.");
  const task = mapTaskRow(data as Record<string, unknown>);

  if (input.status !== undefined && input.status !== prev.status) {
    await appendTaskEvent({
      taskId,
      leadId: task.leadId,
      eventType: "status_changed",
      body: `${prev.status} → ${task.status}`,
      changes: { from: prev.status, to: task.status },
      actor,
    });
  }
  if (
    input.assignedToUserId !== undefined &&
    input.assignedToUserId !== prev.assignedToUserId
  ) {
    await appendTaskEvent({
      taskId,
      leadId: task.leadId,
      eventType: "reassigned",
      body: `Reassigned to ${task.assignedToName ?? "unassigned"}`,
      changes: {
        from: prev.assignedToUserId,
        to: task.assignedToUserId,
        comment: input.description === undefined ? null : undefined,
      },
      actor,
    });
    if (task.assignedToUserId && task.assignedToUserId !== actor.userId) {
      await createNotification({
        userId: task.assignedToUserId,
        type: "task_assigned",
        title: `Task assigned: ${task.title}`,
        body: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString()}` : null,
        leadId: task.leadId,
        link: `/sales-operation/tasks?task=${task.id}&kind=lead`,
      });
    }
  }
  if (input.dueAt !== undefined && (input.dueAt?.trim() || null) !== prev.dueAt) {
    await appendTaskEvent({
      taskId,
      leadId: task.leadId,
      eventType: "due_changed",
      body: task.dueAt ? `Due ${task.dueAt}` : "Due date cleared",
      changes: { from: prev.dueAt, to: task.dueAt },
      actor,
    });
  }
  if (
    input.resultSummary !== undefined &&
    (input.resultSummary?.trim() || null) !== prev.resultSummary
  ) {
    await appendTaskEvent({
      taskId,
      leadId: task.leadId,
      eventType: "summary_updated",
      body: task.resultSummary,
      actor,
    });
  }

  return task;
}

export async function reassignSalesTask(
  taskId: string,
  input: {
    assignedToUserId: string;
    assignedToName?: string | null;
    dueAt?: string | null;
    comment?: string | null;
  },
  actor: { userId: string | null; name: string },
): Promise<SalesTask> {
  const task = await updateSalesTask(
    taskId,
    {
      assignedToUserId: input.assignedToUserId,
      assignedToName: input.assignedToName,
      dueAt: input.dueAt,
    },
    actor,
  );
  if (input.comment?.trim()) {
    await appendTaskEvent({
      taskId,
      leadId: task.leadId,
      eventType: "comment",
      body: input.comment.trim(),
      actor,
    });
  }
  return task;
}

export async function deleteSalesTask(taskId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
}

export type ListTasksFilter = {
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  statuses?: SalesTaskStatus[];
};

function mapTaskWithLeadRow(row: Record<string, unknown>): SalesTaskWithLead & {
  leadAssignedManagerUserId?: string | null;
} {
  const base = mapTaskRow(row);
  const lead = (row.lead ?? null) as Record<string, unknown> | null;
  return {
    ...base,
    leadName: lead ? String(lead.full_name ?? "") : "",
    leadCompanyName: lead ? readText(lead.company_name) : null,
    leadStatus: normalizeSalesLeadStatus(lead?.status),
    leadAssignedManagerUserId:
      typeof lead?.assigned_manager_user_id === "string" ? lead.assigned_manager_user_id : null,
  };
}

export async function listSalesTasksWithLead(
  filter: ListTasksFilter,
): Promise<SalesTaskWithLead[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_tasks")
    .select("*, lead:sales_leads(full_name, company_name, status, assigned_manager_user_id)");

  if (filter.assignedToUserId) {
    query = query.eq("assigned_to_user_id", filter.assignedToUserId);
  }
  if (filter.createdByUserId) {
    query = query.eq("created_by_user_id", filter.createdByUserId);
  }
  const statuses = filter.statuses ?? ["open"];
  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }
  query = query.order("due_at", { ascending: true, nullsFirst: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTaskWithLeadRow(row as Record<string, unknown>));
}
