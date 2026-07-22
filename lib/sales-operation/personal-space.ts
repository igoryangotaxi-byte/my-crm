import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  normalizeTaskPriority,
  normalizeTaskStatus,
} from "@/lib/sales-operation/task-utils";
import type {
  CreatePersonalNoteInput,
  CreatePersonalTaskInput,
  PersonalNote,
  PersonalTask,
  SalesTaskStatus,
  UpdatePersonalNoteInput,
  UpdatePersonalTaskInput,
} from "@/lib/sales-operation/types";

type Owner = { userId: string; email: string | null };

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapPersonalTaskRow(row: Record<string, unknown>): PersonalTask {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userEmail: readText(row.user_email),
    title: String(row.title ?? ""),
    description: readText(row.description),
    status: normalizeTaskStatus(row.status),
    priority: normalizeTaskPriority(row.priority),
    dueAt: readText(row.due_at),
    completedAt: readText(row.completed_at),
    clientId: typeof row.client_id === "string" ? row.client_id : null,
    leadId: typeof row.lead_id === "string" ? row.lead_id : null,
    sourceClientId: typeof row.source_client_id === "string" ? row.source_client_id : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapPersonalNoteRow(row: Record<string, unknown>): PersonalNote {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    userEmail: readText(row.user_email),
    title: readText(row.title),
    body: String(row.body ?? ""),
    pinned: Boolean(row.pinned),
    clientId: typeof row.client_id === "string" ? row.client_id : null,
    sourceClientNoteId:
      typeof row.source_client_note_id === "string" ? row.source_client_note_id : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function listPersonalTasks(
  owner: Owner,
  statuses: SalesTaskStatus[],
): Promise<PersonalTask[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_personal_tasks")
    .select("*")
    .eq("user_id", owner.userId);
  if (statuses.length > 0) {
    query = query.in("status", statuses);
  }
  query = query.order("due_at", { ascending: true, nullsFirst: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPersonalTaskRow(row as Record<string, unknown>));
}

export async function createPersonalTask(
  owner: Owner,
  input: CreatePersonalTaskInput,
): Promise<PersonalTask> {
  const title = input.title?.trim();
  if (!title) throw new Error("Task title is required.");

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: owner.userId,
    user_email: owner.email,
    title,
    description: input.description?.trim() || null,
    status: "open",
    priority: normalizeTaskPriority(input.priority),
    due_at: input.dueAt?.trim() || null,
    client_id: input.clientId?.trim() || null,
    lead_id: input.leadId?.trim() || null,
    source_client_id: input.sourceClientId?.trim() || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("sales_personal_tasks")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create task.");
  return mapPersonalTaskRow(data as Record<string, unknown>);
}

export async function updatePersonalTask(
  owner: Owner,
  taskId: string,
  input: UpdatePersonalTaskInput,
): Promise<PersonalTask> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { updated_at: now };

  if (input.title !== undefined) {
    const trimmed = input.title?.trim();
    if (!trimmed) throw new Error("Task title is required.");
    payload.title = trimmed;
  }
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.priority !== undefined) payload.priority = normalizeTaskPriority(input.priority);
  if (input.dueAt !== undefined) payload.due_at = input.dueAt?.trim() || null;
  if (input.status !== undefined) {
    const nextStatus: SalesTaskStatus = normalizeTaskStatus(input.status);
    payload.status = nextStatus;
    payload.completed_at = nextStatus === "done" ? now : null;
  }

  const { data, error } = await supabase
    .from("sales_personal_tasks")
    .update(payload)
    .eq("id", taskId)
    .eq("user_id", owner.userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Task not found.");
  return mapPersonalTaskRow(data as Record<string, unknown>);
}

export async function deletePersonalTask(owner: Owner, taskId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("sales_personal_tasks")
    .delete()
    .eq("id", taskId)
    .eq("user_id", owner.userId);
  if (error) throw new Error(error.message);
}

export async function listPersonalNotes(owner: Owner): Promise<PersonalNote[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_personal_notes")
    .select("*")
    .eq("user_id", owner.userId)
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapPersonalNoteRow(row as Record<string, unknown>));
}

export async function createPersonalNote(
  owner: Owner,
  input: CreatePersonalNoteInput,
): Promise<PersonalNote> {
  const body = input.body?.trim();
  if (!body) throw new Error("Note body is required.");

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    user_id: owner.userId,
    user_email: owner.email,
    title: input.title?.trim() || null,
    body,
    pinned: Boolean(input.pinned),
    client_id: input.clientId?.trim() || null,
    source_client_note_id: input.sourceClientNoteId?.trim() || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("sales_personal_notes")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create note.");
  return mapPersonalNoteRow(data as Record<string, unknown>);
}

export async function updatePersonalNote(
  owner: Owner,
  noteId: string,
  input: UpdatePersonalNoteInput,
): Promise<PersonalNote> {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (input.title !== undefined) payload.title = input.title?.trim() || null;
  if (input.body !== undefined) {
    const trimmed = input.body?.trim();
    if (!trimmed) throw new Error("Note body is required.");
    payload.body = trimmed;
  }
  if (input.pinned !== undefined) payload.pinned = Boolean(input.pinned);

  const { data, error } = await supabase
    .from("sales_personal_notes")
    .update(payload)
    .eq("id", noteId)
    .eq("user_id", owner.userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Note not found.");
  return mapPersonalNoteRow(data as Record<string, unknown>);
}

export async function deletePersonalNote(owner: Owner, noteId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from("sales_personal_notes")
    .delete()
    .eq("id", noteId)
    .eq("user_id", owner.userId);
  if (error) throw new Error(error.message);
}
