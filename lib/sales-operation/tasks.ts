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
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
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

  // Notify the assignee (unless they assigned it to themselves).
  if (task.assignedToUserId && task.assignedToUserId !== actor.userId) {
    await createNotification({
      userId: task.assignedToUserId,
      type: "task_assigned",
      title: `New task: ${task.title}`,
      body: task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString()}` : null,
      leadId,
      link: "/sales-operation/tasks",
    });
  }

  return task;
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
  return mapTaskRow(data as Record<string, unknown>);
}

export async function deleteSalesTask(taskId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_tasks").delete().eq("id", taskId);
  if (error) throw new Error(error.message);
}

export type ListTasksFilter = {
  assignedToUserId?: string | null;
  statuses?: SalesTaskStatus[];
};

function mapTaskWithLeadRow(row: Record<string, unknown>): SalesTaskWithLead {
  const base = mapTaskRow(row);
  const lead = (row.lead ?? null) as Record<string, unknown> | null;
  return {
    ...base,
    leadName: lead ? String(lead.full_name ?? "") : "",
    leadCompanyName: lead ? readText(lead.company_name) : null,
    leadStatus: normalizeSalesLeadStatus(lead?.status),
  };
}

export async function listSalesTasksWithLead(
  filter: ListTasksFilter,
): Promise<SalesTaskWithLead[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_tasks")
    .select("*, lead:sales_leads(full_name, company_name, status)");

  if (filter.assignedToUserId) {
    query = query.eq("assigned_to_user_id", filter.assignedToUserId);
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
