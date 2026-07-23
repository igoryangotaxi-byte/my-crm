import { createNotification } from "@/lib/sales-operation/notifications";
import { findMentionedUserIds } from "@/lib/sales-operation/mentions";
import {
  DEFAULT_TRACKER_STATUSES,
  TRACKER_LINK_TYPES,
  TRACKER_PRIORITIES,
  type TrackerActivity,
  type TrackerAssignee,
  type TrackerBoardFilters,
  type TrackerChecklistItem,
  type TrackerComment,
  type TrackerFile,
  type TrackerLabel,
  type TrackerLinkType,
  type TrackerPriority,
  type TrackerProject,
  type TrackerStatus,
  type TrackerTicket,
  type TrackerTicketDetail,
  type TrackerTicketLink,
} from "@/lib/sales-operation/tracker-types";
import { getSupabaseAdminClient } from "@/lib/supabase";

const BUCKET = "sales-attachments";
const SIGNED_URL_TTL_SECONDS = 60 * 30;
export const MAX_TRACKER_FILE_BYTES = 25 * 1024 * 1024;

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeTrackerPriority(value: unknown): TrackerPriority {
  const raw = typeof value === "string" ? value.trim() : "";
  return (TRACKER_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as TrackerPriority)
    : "normal";
}

export function normalizeTrackerLinkType(value: unknown): TrackerLinkType | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return (TRACKER_LINK_TYPES as readonly string[]).includes(raw)
    ? (raw as TrackerLinkType)
    : null;
}

function mapProject(row: Record<string, unknown>): TrackerProject {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    description: readText(row.description),
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: readText(row.created_by_name),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapStatus(row: Record<string, unknown>): TrackerStatus {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name ?? ""),
    color: String(row.color ?? "#64748b"),
    position: Number(row.position ?? 0),
    wipLimit:
      row.wip_limit === null || row.wip_limit === undefined ? null : Number(row.wip_limit),
    isDone: Boolean(row.is_done),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapLabel(row: Record<string, unknown>): TrackerLabel {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name ?? ""),
    color: String(row.color ?? "#94a3b8"),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapTicketBase(row: Record<string, unknown>): Omit<TrackerTicket, "assignees" | "labels"> {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    statusId: String(row.status_id),
    title: String(row.title ?? ""),
    description: readText(row.description),
    priority: normalizeTrackerPriority(row.priority),
    dueAt: typeof row.due_at === "string" ? row.due_at : null,
    position: Number(row.position ?? 0),
    parentTicketId: typeof row.parent_ticket_id === "string" ? row.parent_ticket_id : null,
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: readText(row.created_by_name),
    archivedAt: typeof row.archived_at === "string" ? row.archived_at : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapChecklist(row: Record<string, unknown>): TrackerChecklistItem {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    title: String(row.title ?? ""),
    done: Boolean(row.done),
    position: Number(row.position ?? 0),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapComment(row: Record<string, unknown>): TrackerComment {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    authorUserId: typeof row.author_user_id === "string" ? row.author_user_id : null,
    authorName: readText(row.author_name),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapLink(row: Record<string, unknown>): TrackerTicketLink {
  return {
    id: String(row.id),
    fromTicketId: String(row.from_ticket_id),
    toTicketId: String(row.to_ticket_id),
    linkType: (normalizeTrackerLinkType(row.link_type) ?? "related") as TrackerLinkType,
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapActivity(row: Record<string, unknown>): TrackerActivity {
  const payload =
    row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? (row.payload as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorName: readText(row.actor_name),
    eventType: String(row.event_type ?? "system"),
    payload,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function mapFile(row: Record<string, unknown>): TrackerFile {
  return {
    id: String(row.id),
    ticketId: String(row.ticket_id),
    storagePath: String(row.storage_path ?? ""),
    fileName: String(row.file_name ?? ""),
    mimeType: readText(row.mime_type),
    sizeBytes:
      row.size_bytes === null || row.size_bytes === undefined ? null : Number(row.size_bytes),
    uploadedByUserId: typeof row.uploaded_by_user_id === "string" ? row.uploaded_by_user_id : null,
    uploadedByName: readText(row.uploaded_by_name),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    downloadUrl: null,
  };
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[^\w.\-() ]+/g, "_");
  return trimmed.slice(0, 180) || "file";
}

function ticketLink(projectId: string, ticketId: string): string {
  return `/sales-operation/tracker/${projectId}?ticket=${ticketId}`;
}

async function appendActivity(
  ticketId: string,
  eventType: string,
  actor: { userId: string | null; name: string },
  payload: Record<string, unknown> = {},
): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from("tracker_activity").insert({
    ticket_id: ticketId,
    actor_user_id: actor.userId,
    actor_name: actor.name,
    event_type: eventType,
    payload,
    created_at: new Date().toISOString(),
  });
}

async function loadAssigneesForTickets(
  ticketIds: string[],
): Promise<Map<string, TrackerAssignee[]>> {
  const map = new Map<string, TrackerAssignee[]>();
  if (ticketIds.length === 0) return map;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_ticket_assignees")
    .select("*")
    .in("ticket_id", ticketIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const ticketId = String(r.ticket_id);
    const list = map.get(ticketId) ?? [];
    list.push({
      userId: String(r.user_id),
      userName: readText(r.user_name),
    });
    map.set(ticketId, list);
  }
  return map;
}

async function loadLabelsForTickets(ticketIds: string[]): Promise<Map<string, TrackerLabel[]>> {
  const map = new Map<string, TrackerLabel[]>();
  if (ticketIds.length === 0) return map;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_ticket_labels")
    .select("ticket_id, label:tracker_labels(*)")
    .in("ticket_id", ticketIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const ticketId = String(r.ticket_id);
    const labelRow = r.label as Record<string, unknown> | null;
    if (!labelRow) continue;
    const list = map.get(ticketId) ?? [];
    list.push(mapLabel(labelRow));
    map.set(ticketId, list);
  }
  return map;
}

async function loadChecklistCounts(
  ticketIds: string[],
): Promise<Map<string, { done: number; total: number }>> {
  const map = new Map<string, { done: number; total: number }>();
  if (ticketIds.length === 0) return map;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_checklist_items")
    .select("ticket_id, done")
    .in("ticket_id", ticketIds);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const r = row as Record<string, unknown>;
    const ticketId = String(r.ticket_id);
    const cur = map.get(ticketId) ?? { done: 0, total: 0 };
    cur.total += 1;
    if (r.done) cur.done += 1;
    map.set(ticketId, cur);
  }
  return map;
}

function enrichTickets(
  rows: Record<string, unknown>[],
  assignees: Map<string, TrackerAssignee[]>,
  labels: Map<string, TrackerLabel[]>,
  checklist: Map<string, { done: number; total: number }>,
): TrackerTicket[] {
  return rows.map((row) => {
    const base = mapTicketBase(row);
    const counts = checklist.get(base.id);
    return {
      ...base,
      assignees: assignees.get(base.id) ?? [],
      labels: labels.get(base.id) ?? [],
      checklistDone: counts?.done ?? 0,
      checklistTotal: counts?.total ?? 0,
      projectName: readText(row.project_name) ?? undefined,
      statusName: readText(row.status_name) ?? undefined,
      statusIsDone: typeof row.status_is_done === "boolean" ? row.status_is_done : undefined,
      statusColor: readText(row.status_color) ?? undefined,
    };
  });
}

export async function listTrackerProjects(options: {
  includeArchived?: boolean;
}): Promise<TrackerProject[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("tracker_projects").select("*").order("updated_at", { ascending: false });
  if (!options.includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const projects = (data ?? []).map((row) => mapProject(row as Record<string, unknown>));
  if (projects.length === 0) return projects;

  const ids = projects.map((p) => p.id);
  const { data: tickets, error: ticketError } = await supabase
    .from("tracker_tickets")
    .select("project_id, archived_at, status_id")
    .in("project_id", ids);
  if (ticketError) throw new Error(ticketError.message);

  const { data: statuses, error: statusError } = await supabase
    .from("tracker_statuses")
    .select("id, is_done")
    .in("project_id", ids);
  if (statusError) throw new Error(statusError.message);
  const doneStatusIds = new Set(
    (statuses ?? []).filter((s) => (s as { is_done?: boolean }).is_done).map((s) => String((s as { id: string }).id)),
  );

  const counts = new Map<string, { total: number; open: number }>();
  for (const row of tickets ?? []) {
    const r = row as Record<string, unknown>;
    const projectId = String(r.project_id);
    const cur = counts.get(projectId) ?? { total: 0, open: 0 };
    if (!r.archived_at) {
      cur.total += 1;
      if (!doneStatusIds.has(String(r.status_id))) cur.open += 1;
    }
    counts.set(projectId, cur);
  }

  return projects.map((p) => ({
    ...p,
    ticketCount: counts.get(p.id)?.total ?? 0,
    openTicketCount: counts.get(p.id)?.open ?? 0,
  }));
}

export async function getTrackerProject(projectId: string): Promise<TrackerProject | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapProject(data as Record<string, unknown>) : null;
}

export async function createTrackerProject(
  input: { name: string; description?: string | null },
  actor: { userId: string | null; name: string },
): Promise<TrackerProject> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tracker_projects")
    .insert({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const project = mapProject(data as Record<string, unknown>);

  const statusRows = DEFAULT_TRACKER_STATUSES.map((status, index) => ({
    project_id: project.id,
    name: status.name,
    color: status.color,
    position: index,
    is_done: status.isDone,
    created_at: now,
    updated_at: now,
  }));
  const { error: statusError } = await supabase.from("tracker_statuses").insert(statusRows);
  if (statusError) throw new Error(statusError.message);
  return project;
}

export async function updateTrackerProject(
  projectId: string,
  patch: { name?: string; description?: string | null; archivedAt?: string | null },
): Promise<TrackerProject> {
  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.archivedAt !== undefined) updates.archived_at = patch.archivedAt;
  const { data, error } = await supabase
    .from("tracker_projects")
    .update(updates)
    .eq("id", projectId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapProject(data as Record<string, unknown>);
}

export async function deleteTrackerProject(projectId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("tracker_projects").delete().eq("id", projectId);
  if (error) throw new Error(error.message);
}

export async function listTrackerStatuses(projectId: string): Promise<TrackerStatus[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_statuses")
    .select("*")
    .eq("project_id", projectId)
    .order("position", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapStatus(row as Record<string, unknown>));
}

export async function createTrackerStatus(
  projectId: string,
  input: { name: string; color?: string; wipLimit?: number | null; isDone?: boolean },
): Promise<TrackerStatus> {
  const supabase = getSupabaseAdminClient();
  const existing = await listTrackerStatuses(projectId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tracker_statuses")
    .insert({
      project_id: projectId,
      name: input.name.trim(),
      color: input.color?.trim() || "#64748b",
      position: existing.length,
      wip_limit: input.wipLimit ?? null,
      is_done: Boolean(input.isDone),
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await supabase
    .from("tracker_projects")
    .update({ updated_at: now })
    .eq("id", projectId);
  return mapStatus(data as Record<string, unknown>);
}

export async function updateTrackerStatus(
  statusId: string,
  patch: {
    name?: string;
    color?: string;
    wipLimit?: number | null;
    isDone?: boolean;
    position?: number;
  },
): Promise<TrackerStatus> {
  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.color !== undefined) updates.color = patch.color.trim();
  if (patch.wipLimit !== undefined) updates.wip_limit = patch.wipLimit;
  if (patch.isDone !== undefined) updates.is_done = patch.isDone;
  if (patch.position !== undefined) updates.position = patch.position;
  const { data, error } = await supabase
    .from("tracker_statuses")
    .update(updates)
    .eq("id", statusId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapStatus(data as Record<string, unknown>);
}

export async function deleteTrackerStatus(statusId: string, moveToStatusId?: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data: status, error: statusError } = await supabase
    .from("tracker_statuses")
    .select("*")
    .eq("id", statusId)
    .maybeSingle();
  if (statusError) throw new Error(statusError.message);
  if (!status) throw new Error("Status not found.");

  const { count, error: countError } = await supabase
    .from("tracker_tickets")
    .select("id", { count: "exact", head: true })
    .eq("status_id", statusId)
    .is("archived_at", null);
  if (countError) throw new Error(countError.message);
  if ((count ?? 0) > 0) {
    if (!moveToStatusId) {
      throw new Error("Status has tickets. Provide moveToStatusId or archive tickets first.");
    }
    const { error: moveError } = await supabase
      .from("tracker_tickets")
      .update({ status_id: moveToStatusId, updated_at: new Date().toISOString() })
      .eq("status_id", statusId);
    if (moveError) throw new Error(moveError.message);
  }

  const { error } = await supabase.from("tracker_statuses").delete().eq("id", statusId);
  if (error) throw new Error(error.message);
}

export async function reorderTrackerStatuses(
  projectId: string,
  orderedIds: string[],
): Promise<TrackerStatus[]> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase
        .from("tracker_statuses")
        .update({ position: index, updated_at: now })
        .eq("id", id)
        .eq("project_id", projectId),
    ),
  );
  return listTrackerStatuses(projectId);
}

export async function listTrackerLabels(projectId: string): Promise<TrackerLabel[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_labels")
    .select("*")
    .eq("project_id", projectId)
    .order("name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLabel(row as Record<string, unknown>));
}

export async function createTrackerLabel(
  projectId: string,
  input: { name: string; color?: string },
): Promise<TrackerLabel> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_labels")
    .insert({
      project_id: projectId,
      name: input.name.trim(),
      color: input.color?.trim() || "#94a3b8",
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapLabel(data as Record<string, unknown>);
}

export async function deleteTrackerLabel(labelId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("tracker_labels").delete().eq("id", labelId);
  if (error) throw new Error(error.message);
}

async function nextPosition(statusId: string): Promise<number> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_tickets")
    .select("position")
    .eq("status_id", statusId)
    .is("archived_at", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const top = data?.[0] as { position?: number } | undefined;
  return (top?.position ?? 0) + 1000;
}

export async function listTrackerTickets(
  projectId: string,
  filters: TrackerBoardFilters = {},
): Promise<TrackerTicket[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("tracker_tickets").select("*").eq("project_id", projectId);
  if (!filters.includeArchived) query = query.is("archived_at", null);
  if (filters.statusIds?.length) query = query.in("status_id", filters.statusIds);
  if (filters.priorities?.length) query = query.in("priority", filters.priorities);
  if (filters.creatorUserIds?.length) query = query.in("created_by_user_id", filters.creatorUserIds);
  if (filters.dueFrom) query = query.gte("due_at", filters.dueFrom);
  if (filters.dueTo) query = query.lte("due_at", filters.dueTo);
  if (filters.createdFrom) query = query.gte("created_at", filters.createdFrom);
  if (filters.createdTo) query = query.lte("created_at", filters.createdTo);
  if (filters.updatedFrom) query = query.gte("updated_at", filters.updatedFrom);
  if (filters.updatedTo) query = query.lte("updated_at", filters.updatedTo);
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
  }
  query = query.order("position", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as Record<string, unknown>[];

  if (filters.assigneeUserIds?.length) {
    const { data: assigneeRows, error: assigneeError } = await supabase
      .from("tracker_ticket_assignees")
      .select("ticket_id")
      .in("user_id", filters.assigneeUserIds);
    if (assigneeError) throw new Error(assigneeError.message);
    const allowed = new Set((assigneeRows ?? []).map((r) => String((r as { ticket_id: string }).ticket_id)));
    rows = rows.filter((r) => allowed.has(String(r.id)));
  }

  if (filters.labelIds?.length) {
    const { data: labelRows, error: labelError } = await supabase
      .from("tracker_ticket_labels")
      .select("ticket_id")
      .in("label_id", filters.labelIds);
    if (labelError) throw new Error(labelError.message);
    const allowed = new Set((labelRows ?? []).map((r) => String((r as { ticket_id: string }).ticket_id)));
    rows = rows.filter((r) => allowed.has(String(r.id)));
  }

  const limit = filters.limitPerStatus ?? 100;
  const byStatus = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const statusId = String(row.status_id);
    const list = byStatus.get(statusId) ?? [];
    if (list.length < limit) list.push(row);
    byStatus.set(statusId, list);
  }
  rows = Array.from(byStatus.values()).flat();

  const ids = rows.map((r) => String(r.id));
  const [assignees, labels, checklist] = await Promise.all([
    loadAssigneesForTickets(ids),
    loadLabelsForTickets(ids),
    loadChecklistCounts(ids),
  ]);
  return enrichTickets(rows, assignees, labels, checklist);
}

export async function getTrackerTicket(ticketId: string): Promise<TrackerTicketDetail | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_tickets")
    .select("*")
    .eq("id", ticketId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const [assignees, labels, checklist, comments, links, activity, files, subtasks] =
    await Promise.all([
      loadAssigneesForTickets([ticketId]),
      loadLabelsForTickets([ticketId]),
      supabase
        .from("tracker_checklist_items")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("position", { ascending: true }),
      supabase
        .from("tracker_comments")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }),
      supabase.from("tracker_ticket_links").select("*").eq("from_ticket_id", ticketId),
      supabase
        .from("tracker_activity")
        .select("*")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: false })
        .limit(100),
      listTrackerFiles(ticketId),
      supabase
        .from("tracker_tickets")
        .select("*")
        .eq("parent_ticket_id", ticketId)
        .is("archived_at", null)
        .order("position", { ascending: true }),
    ]);

  if (checklist.error) throw new Error(checklist.error.message);
  if (comments.error) throw new Error(comments.error.message);
  if (links.error) throw new Error(links.error.message);
  if (activity.error) throw new Error(activity.error.message);
  if (subtasks.error) throw new Error(subtasks.error.message);

  const linkRows = (links.data ?? []) as Record<string, unknown>[];
  const toIds = linkRows.map((r) => String(r.to_ticket_id));
  let titleById = new Map<string, { title: string; projectId: string }>();
  if (toIds.length) {
    const { data: linkedTickets, error: linkedError } = await supabase
      .from("tracker_tickets")
      .select("id, title, project_id")
      .in("id", toIds);
    if (linkedError) throw new Error(linkedError.message);
    titleById = new Map(
      (linkedTickets ?? []).map((t) => [
        String((t as { id: string }).id),
        {
          title: String((t as { title: string }).title),
          projectId: String((t as { project_id: string }).project_id),
        },
      ]),
    );
  }

  const base = mapTicketBase(row);
  const checklistItems = (checklist.data ?? []).map((r) => mapChecklist(r as Record<string, unknown>));
  const subtaskRows = (subtasks.data ?? []) as Record<string, unknown>[];
  const subIds = subtaskRows.map((r) => String(r.id));
  const [subAssignees, subLabels, subCounts] = await Promise.all([
    loadAssigneesForTickets(subIds),
    loadLabelsForTickets(subIds),
    loadChecklistCounts(subIds),
  ]);

  return {
    ...base,
    assignees: assignees.get(ticketId) ?? [],
    labels: labels.get(ticketId) ?? [],
    checklistDone: checklistItems.filter((c) => c.done).length,
    checklistTotal: checklistItems.length,
    checklist: checklistItems,
    comments: (comments.data ?? []).map((r) => mapComment(r as Record<string, unknown>)),
    links: linkRows.map((r) => {
      const link = mapLink(r);
      const meta = titleById.get(link.toTicketId);
      return {
        ...link,
        toTicketTitle: meta?.title ?? null,
        toTicketProjectId: meta?.projectId ?? null,
      };
    }),
    activity: (activity.data ?? []).map((r) => mapActivity(r as Record<string, unknown>)),
    files,
    subtasks: enrichTickets(subtaskRows, subAssignees, subLabels, subCounts),
  };
}

export async function createTrackerTicket(
  projectId: string,
  input: {
    title: string;
    description?: string | null;
    statusId: string;
    priority?: TrackerPriority;
    dueAt?: string | null;
    parentTicketId?: string | null;
    assigneeUserIds?: Array<{ userId: string; userName?: string | null }>;
    labelIds?: string[];
  },
  actor: { userId: string | null; name: string },
): Promise<TrackerTicket> {
  const supabase = getSupabaseAdminClient();
  const position = await nextPosition(input.statusId);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tracker_tickets")
    .insert({
      project_id: projectId,
      status_id: input.statusId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      priority: normalizeTrackerPriority(input.priority),
      due_at: input.dueAt || null,
      position,
      parent_ticket_id: input.parentTicketId ?? null,
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const ticket = mapTicketBase(data as Record<string, unknown>);

  if (input.assigneeUserIds?.length) {
    await setTicketAssignees(ticket.id, input.assigneeUserIds, actor, { notify: true });
  }
  if (input.labelIds?.length) {
    await setTicketLabels(ticket.id, input.labelIds);
  }

  await appendActivity(ticket.id, "created", actor, { title: ticket.title });
  await supabase.from("tracker_projects").update({ updated_at: now }).eq("id", projectId);

  const detail = await getTrackerTicket(ticket.id);
  if (!detail) throw new Error("Failed to load created ticket.");
  return detail;
}

export async function updateTrackerTicket(
  ticketId: string,
  patch: {
    title?: string;
    description?: string | null;
    priority?: TrackerPriority;
    dueAt?: string | null;
    parentTicketId?: string | null;
    statusId?: string;
  },
  actor: { userId: string | null; name: string },
): Promise<TrackerTicketDetail> {
  const supabase = getSupabaseAdminClient();
  const existing = await getTrackerTicket(ticketId);
  if (!existing) throw new Error("Ticket not found.");

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.description !== undefined) updates.description = patch.description?.trim() || null;
  if (patch.priority !== undefined) updates.priority = normalizeTrackerPriority(patch.priority);
  if (patch.dueAt !== undefined) updates.due_at = patch.dueAt;
  if (patch.parentTicketId !== undefined) updates.parent_ticket_id = patch.parentTicketId;
  if (patch.statusId !== undefined && patch.statusId !== existing.statusId) {
    updates.status_id = patch.statusId;
    updates.position = await nextPosition(patch.statusId);
  }

  const { error } = await supabase.from("tracker_tickets").update(updates).eq("id", ticketId);
  if (error) throw new Error(error.message);

  if (patch.statusId && patch.statusId !== existing.statusId) {
    await appendActivity(ticketId, "status_changed", actor, {
      from: existing.statusId,
      to: patch.statusId,
    });
    const { data: status } = await supabase
      .from("tracker_statuses")
      .select("is_done, name")
      .eq("id", patch.statusId)
      .maybeSingle();
    for (const assignee of existing.assignees) {
      await createNotification({
        userId: assignee.userId,
        type: status && (status as { is_done?: boolean }).is_done ? "tracker_completed" : "tracker_status",
        title: status && (status as { is_done?: boolean }).is_done
          ? `Completed: ${existing.title}`
          : `Status updated: ${existing.title}`,
        body: `Moved to ${(status as { name?: string } | null)?.name ?? "new status"}`,
        link: ticketLink(existing.projectId, ticketId),
      });
    }
  }
  if (patch.title !== undefined && patch.title.trim() !== existing.title) {
    await appendActivity(ticketId, "title_changed", actor, {
      from: existing.title,
      to: patch.title.trim(),
    });
  }
  if (patch.dueAt !== undefined && patch.dueAt !== existing.dueAt) {
    await appendActivity(ticketId, "due_changed", actor, {
      from: existing.dueAt,
      to: patch.dueAt,
    });
  }

  const detail = await getTrackerTicket(ticketId);
  if (!detail) throw new Error("Ticket not found.");
  return detail;
}

export async function moveTrackerTicket(
  ticketId: string,
  input: { statusId: string; position: number },
  actor: { userId: string | null; name: string },
): Promise<TrackerTicket> {
  const existing = await getTrackerTicket(ticketId);
  if (!existing) throw new Error("Ticket not found.");
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tracker_tickets")
    .update({
      status_id: input.statusId,
      position: input.position,
      updated_at: now,
    })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);

  if (input.statusId !== existing.statusId) {
    await appendActivity(ticketId, "status_changed", actor, {
      from: existing.statusId,
      to: input.statusId,
    });
    const { data: status } = await supabase
      .from("tracker_statuses")
      .select("is_done, name")
      .eq("id", input.statusId)
      .maybeSingle();
    for (const assignee of existing.assignees) {
      await createNotification({
        userId: assignee.userId,
        type: status && (status as { is_done?: boolean }).is_done ? "tracker_completed" : "tracker_status",
        title: status && (status as { is_done?: boolean }).is_done
          ? `Completed: ${existing.title}`
          : `Status updated: ${existing.title}`,
        body: `Moved to ${(status as { name?: string } | null)?.name ?? "new status"}`,
        link: ticketLink(existing.projectId, ticketId),
      });
    }
  }

  const detail = await getTrackerTicket(ticketId);
  if (!detail) throw new Error("Ticket not found.");
  return detail;
}

export async function archiveTrackerTicket(
  ticketId: string,
  actor: { userId: string | null; name: string },
  archived = true,
): Promise<TrackerTicketDetail> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("tracker_tickets")
    .update({ archived_at: archived ? now : null, updated_at: now })
    .eq("id", ticketId);
  if (error) throw new Error(error.message);
  await appendActivity(ticketId, archived ? "archived" : "unarchived", actor);
  const detail = await getTrackerTicket(ticketId);
  if (!detail) throw new Error("Ticket not found.");
  return detail;
}

export async function deleteTrackerTicket(ticketId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("tracker_tickets").delete().eq("id", ticketId);
  if (error) throw new Error(error.message);
}

export async function duplicateTrackerTicket(
  ticketId: string,
  actor: { userId: string | null; name: string },
): Promise<TrackerTicket> {
  const existing = await getTrackerTicket(ticketId);
  if (!existing) throw new Error("Ticket not found.");
  const created = await createTrackerTicket(
    existing.projectId,
    {
      title: `${existing.title} (copy)`,
      description: existing.description,
      statusId: existing.statusId,
      priority: existing.priority,
      dueAt: existing.dueAt,
      parentTicketId: existing.parentTicketId,
      assigneeUserIds: existing.assignees.map((a) => ({
        userId: a.userId,
        userName: a.userName,
      })),
      labelIds: existing.labels.map((l) => l.id),
    },
    actor,
  );
  for (const item of existing.checklist) {
    await addChecklistItem(created.id, item.title, actor);
  }
  return created;
}

export async function setTicketAssignees(
  ticketId: string,
  assignees: Array<{ userId: string; userName?: string | null }>,
  actor: { userId: string | null; name: string },
  options: { notify?: boolean } = {},
): Promise<TrackerAssignee[]> {
  const supabase = getSupabaseAdminClient();
  const ticket = await getTrackerTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found.");

  const previous = new Set(ticket.assignees.map((a) => a.userId));
  const nextIds = new Set(assignees.map((a) => a.userId));

  await supabase.from("tracker_ticket_assignees").delete().eq("ticket_id", ticketId);
  if (assignees.length) {
    const { error } = await supabase.from("tracker_ticket_assignees").insert(
      assignees.map((a) => ({
        ticket_id: ticketId,
        user_id: a.userId,
        user_name: a.userName ?? null,
        created_at: new Date().toISOString(),
      })),
    );
    if (error) throw new Error(error.message);
  }

  await appendActivity(ticketId, "assignees_changed", actor, {
    assignees: assignees.map((a) => a.userId),
  });
  await supabase
    .from("tracker_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", ticketId);

  if (options.notify !== false) {
    for (const a of assignees) {
      if (!previous.has(a.userId) && a.userId !== actor.userId) {
        await createNotification({
          userId: a.userId,
          type: "tracker_assigned",
          title: `Assigned: ${ticket.title}`,
          body: `${actor.name} assigned you a Tracker task`,
          link: ticketLink(ticket.projectId, ticketId),
        });
      }
    }
  }

  for (const removed of previous) {
    if (!nextIds.has(removed)) {
      // no notification for unassign in MVP
    }
  }

  return assignees.map((a) => ({ userId: a.userId, userName: a.userName ?? null }));
}

export async function setTicketLabels(ticketId: string, labelIds: string[]): Promise<void> {
  const supabase = getSupabaseAdminClient();
  await supabase.from("tracker_ticket_labels").delete().eq("ticket_id", ticketId);
  if (labelIds.length) {
    const { error } = await supabase.from("tracker_ticket_labels").insert(
      labelIds.map((labelId) => ({ ticket_id: ticketId, label_id: labelId })),
    );
    if (error) throw new Error(error.message);
  }
  await supabase
    .from("tracker_tickets")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", ticketId);
}

export async function addChecklistItem(
  ticketId: string,
  title: string,
  actor: { userId: string | null; name: string },
): Promise<TrackerChecklistItem> {
  const supabase = getSupabaseAdminClient();
  const { data: existing } = await supabase
    .from("tracker_checklist_items")
    .select("position")
    .eq("ticket_id", ticketId)
    .order("position", { ascending: false })
    .limit(1);
  const position = ((existing?.[0] as { position?: number } | undefined)?.position ?? 0) + 1;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tracker_checklist_items")
    .insert({
      ticket_id: ticketId,
      title: title.trim(),
      done: false,
      position,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await appendActivity(ticketId, "checklist_added", actor, { title: title.trim() });
  return mapChecklist(data as Record<string, unknown>);
}

export async function updateChecklistItem(
  itemId: string,
  patch: { title?: string; done?: boolean; position?: number },
  actor: { userId: string | null; name: string },
): Promise<TrackerChecklistItem> {
  const supabase = getSupabaseAdminClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.done !== undefined) updates.done = patch.done;
  if (patch.position !== undefined) updates.position = patch.position;
  const { data, error } = await supabase
    .from("tracker_checklist_items")
    .update(updates)
    .eq("id", itemId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const item = mapChecklist(data as Record<string, unknown>);
  if (patch.done !== undefined) {
    await appendActivity(item.ticketId, "checklist_toggled", actor, {
      itemId,
      done: patch.done,
    });
  }
  return item;
}

export async function deleteChecklistItem(itemId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("tracker_checklist_items").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function addTrackerComment(
  ticketId: string,
  body: string,
  actor: { userId: string | null; name: string },
  staffDirectory: Array<{ id: string; name: string }> = [],
): Promise<TrackerComment> {
  const supabase = getSupabaseAdminClient();
  const ticket = await getTrackerTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found.");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tracker_comments")
    .insert({
      ticket_id: ticketId,
      author_user_id: actor.userId,
      author_name: actor.name,
      body: body.trim(),
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await appendActivity(ticketId, "comment", actor, { preview: body.trim().slice(0, 120) });

  const mentioned = findMentionedUserIds(body, staffDirectory);
  for (const userId of mentioned) {
    if (userId === actor.userId) continue;
    await createNotification({
      userId,
      type: "mention",
      title: `Mentioned in Tracker: ${ticket.title}`,
      body: `${actor.name} mentioned you — ${body.trim().slice(0, 160)}`,
      link: ticketLink(ticket.projectId, ticketId),
    });
  }
  for (const assignee of ticket.assignees) {
    if (assignee.userId === actor.userId || mentioned.includes(assignee.userId)) continue;
    await createNotification({
      userId: assignee.userId,
      type: "tracker_comment",
      title: `Comment on: ${ticket.title}`,
      body: `${actor.name}: ${body.trim().slice(0, 160)}`,
      link: ticketLink(ticket.projectId, ticketId),
    });
  }

  return mapComment(data as Record<string, unknown>);
}

export async function addTicketLink(
  fromTicketId: string,
  toTicketId: string,
  linkType: TrackerLinkType,
  actor: { userId: string | null; name: string },
): Promise<TrackerTicketLink> {
  const type = normalizeTrackerLinkType(linkType);
  if (!type) throw new Error("Invalid link type.");
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_ticket_links")
    .insert({
      from_ticket_id: fromTicketId,
      to_ticket_id: toTicketId,
      link_type: type,
      created_by_user_id: actor.userId,
      created_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await appendActivity(fromTicketId, "link_added", actor, { toTicketId, linkType: type });
  return mapLink(data as Record<string, unknown>);
}

export async function deleteTicketLink(linkId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("tracker_ticket_links").delete().eq("id", linkId);
  if (error) throw new Error(error.message);
}

export async function listTrackerFiles(ticketId: string): Promise<TrackerFile[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_files")
    .select("*")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const files = (data ?? []).map((row) => mapFile(row as Record<string, unknown>));
  if (!files.length) return files;
  const paths = files.map((f) => f.storagePath);
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
  const urlByPath = new Map<string, string>();
  for (const entry of signed ?? []) {
    if (entry.path && entry.signedUrl) urlByPath.set(entry.path, entry.signedUrl);
  }
  return files.map((f) => ({ ...f, downloadUrl: urlByPath.get(f.storagePath) ?? null }));
}

export async function uploadTrackerFile(
  ticketId: string,
  input: { fileName: string; mimeType: string | null; body: ArrayBuffer },
  actor: { userId: string | null; name: string },
): Promise<TrackerFile> {
  const supabase = getSupabaseAdminClient();
  const ticket = await getTrackerTicket(ticketId);
  if (!ticket) throw new Error("Ticket not found.");

  const safeName = sanitizeFileName(input.fileName);
  const unique =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storagePath = `tracker/${ticketId}/${unique}-${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, input.body, {
    contentType: input.mimeType ?? "application/octet-stream",
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("tracker_files")
    .insert({
      ticket_id: ticketId,
      storage_path: storagePath,
      file_name: safeName,
      mime_type: input.mimeType,
      size_bytes: input.body.byteLength,
      uploaded_by_user_id: actor.userId,
      uploaded_by_name: actor.name,
      created_at: now,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await appendActivity(ticketId, "file_uploaded", actor, { fileName: safeName });
  const file = mapFile(data as Record<string, unknown>);
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
  return { ...file, downloadUrl: signed?.signedUrl ?? null };
}

export async function deleteTrackerFile(fileId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("tracker_files")
    .select("*")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return;
  const row = data as Record<string, unknown>;
  await supabase.storage.from(BUCKET).remove([String(row.storage_path)]);
  const { error: delError } = await supabase.from("tracker_files").delete().eq("id", fileId);
  if (delError) throw new Error(delError.message);
}

export async function listMyTrackerTickets(options: {
  userId: string;
  scope: "mine" | "created";
  includeDone?: boolean;
  includeArchived?: boolean;
}): Promise<TrackerTicket[]> {
  const supabase = getSupabaseAdminClient();
  let ticketIds: string[] = [];

  if (options.scope === "mine") {
    const { data, error } = await supabase
      .from("tracker_ticket_assignees")
      .select("ticket_id")
      .eq("user_id", options.userId);
    if (error) throw new Error(error.message);
    ticketIds = (data ?? []).map((r) => String((r as { ticket_id: string }).ticket_id));
  }

  let query = supabase.from("tracker_tickets").select("*");
  if (options.scope === "mine") {
    if (ticketIds.length === 0) return [];
    query = query.in("id", ticketIds);
  } else {
    query = query.eq("created_by_user_id", options.userId);
  }
  if (!options.includeArchived) query = query.is("archived_at", null);
  query = query.order("due_at", { ascending: true, nullsFirst: false }).order("updated_at", {
    ascending: false,
  });

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  let rows = (data ?? []) as Record<string, unknown>[];

  if (!options.includeDone && rows.length) {
    const statusIds = Array.from(new Set(rows.map((r) => String(r.status_id))));
    const { data: statuses, error: statusError } = await supabase
      .from("tracker_statuses")
      .select("id, is_done, name, color")
      .in("id", statusIds);
    if (statusError) throw new Error(statusError.message);
    const statusMeta = new Map(
      (statuses ?? []).map((s) => [
        String((s as { id: string }).id),
        s as { is_done?: boolean; name?: string; color?: string },
      ]),
    );
    rows = rows
      .map((r) => {
        const meta = statusMeta.get(String(r.status_id));
        return {
          ...r,
          status_is_done: Boolean(meta?.is_done),
          status_name: meta?.name ?? null,
          status_color: meta?.color ?? null,
        };
      })
      .filter((r) => options.includeDone || !r.status_is_done);
  } else if (rows.length) {
    const statusIds = Array.from(new Set(rows.map((r) => String(r.status_id))));
    const { data: statuses } = await supabase
      .from("tracker_statuses")
      .select("id, is_done, name, color")
      .in("id", statusIds);
    const statusMeta = new Map(
      (statuses ?? []).map((s) => [
        String((s as { id: string }).id),
        s as { is_done?: boolean; name?: string; color?: string },
      ]),
    );
    rows = rows.map((r) => {
      const meta = statusMeta.get(String(r.status_id));
      return {
        ...r,
        status_is_done: Boolean(meta?.is_done),
        status_name: meta?.name ?? null,
        status_color: meta?.color ?? null,
      };
    });
  }

  const projectIds = Array.from(new Set(rows.map((r) => String(r.project_id))));
  if (projectIds.length) {
    const { data: projects } = await supabase
      .from("tracker_projects")
      .select("id, name")
      .in("id", projectIds);
    const nameById = new Map(
      (projects ?? []).map((p) => [
        String((p as { id: string }).id),
        String((p as { name: string }).name),
      ]),
    );
    rows = rows.map((r) => ({ ...r, project_name: nameById.get(String(r.project_id)) ?? null }));
  }

  const ids = rows.map((r) => String(r.id));
  const [assignees, labels, checklist] = await Promise.all([
    loadAssigneesForTickets(ids),
    loadLabelsForTickets(ids),
    loadChecklistCounts(ids),
  ]);
  return enrichTickets(rows, assignees, labels, checklist);
}

export async function searchTrackerTickets(
  projectId: string,
  q: string,
  limit = 50,
): Promise<TrackerTicket[]> {
  const trimmed = q.trim();
  if (!trimmed) return listTrackerTickets(projectId, { limitPerStatus: limit });

  const supabase = getSupabaseAdminClient();
  const { data: byText, error } = await supabase
    .from("tracker_tickets")
    .select("*")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .or(`title.ilike.%${trimmed}%,description.ilike.%${trimmed}%`)
    .limit(limit);
  if (error) throw new Error(error.message);

  const { data: commentHits } = await supabase
    .from("tracker_comments")
    .select("ticket_id")
    .ilike("body", `%${trimmed}%`)
    .limit(limit);

  const { data: labelHits } = await supabase
    .from("tracker_labels")
    .select("id")
    .eq("project_id", projectId)
    .ilike("name", `%${trimmed}%`);

  const labelIds = (labelHits ?? []).map((l) => String((l as { id: string }).id));
  let labelTicketIds: string[] = [];
  if (labelIds.length) {
    const { data: tl } = await supabase
      .from("tracker_ticket_labels")
      .select("ticket_id")
      .in("label_id", labelIds);
    labelTicketIds = (tl ?? []).map((r) => String((r as { ticket_id: string }).ticket_id));
  }

  const { data: assigneeHits } = await supabase
    .from("tracker_ticket_assignees")
    .select("ticket_id")
    .ilike("user_name", `%${trimmed}%`)
    .limit(limit);

  const idSet = new Set<string>([
    ...((byText ?? []) as Record<string, unknown>[]).map((r) => String(r.id)),
    ...((commentHits ?? []) as Array<{ ticket_id: string }>).map((r) => String(r.ticket_id)),
    ...labelTicketIds,
    ...((assigneeHits ?? []) as Array<{ ticket_id: string }>).map((r) => String(r.ticket_id)),
  ]);

  if (idSet.size === 0) return [];
  const { data: rows, error: rowsError } = await supabase
    .from("tracker_tickets")
    .select("*")
    .eq("project_id", projectId)
    .is("archived_at", null)
    .in("id", Array.from(idSet))
    .limit(limit);
  if (rowsError) throw new Error(rowsError.message);
  const list = (rows ?? []) as Record<string, unknown>[];
  const ids = list.map((r) => String(r.id));
  const [assignees, labels, checklist] = await Promise.all([
    loadAssigneesForTickets(ids),
    loadLabelsForTickets(ids),
    loadChecklistCounts(ids),
  ]);
  return enrichTickets(list, assignees, labels, checklist);
}
