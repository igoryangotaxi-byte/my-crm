import { loadAuthStore } from "@/lib/auth-store";
import {
  addTrackerComment,
  archiveTrackerTicket,
  createTrackerProject,
  createTrackerTicket,
  deleteTrackerTicket,
  getTrackerTicket,
  listMyTrackerTickets,
  listTrackerProjects,
  listTrackerStatuses,
  listTrackerTickets,
  setTicketAssignees,
  updateTrackerTicket,
} from "@/lib/sales-operation/tracker";
import { normalizeTrackerPriority } from "@/lib/sales-operation/tracker";
import { canTracker } from "@/lib/sales-operation/tracker-permissions";
import type {
  TrackerAction,
  TrackerProject,
  TrackerStatus,
  TrackerTicket,
} from "@/lib/sales-operation/tracker-types";
import type { AppRole } from "@/types/auth";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

/** The assistant gets exactly the Tracker rights the user has in the UI. */
function denied(action: TrackerAction, run: ToolRun): AiToolResult | null {
  if (canTracker(action, run.role as AppRole)) return null;
  return {
    ok: false,
    status: "denied",
    error: `Your role (${run.role}) lacks the Tracker ${action} permission.`,
  };
}

/** "AI  Test" and "ai test" must resolve to the same queue. */
function key(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const SELF_WORDS = new Set([
  "me",
  "myself",
  "self",
  "i",
  "я",
  "мне",
  "меня",
  "себя",
  "אני",
]);

function ticketUrl(ticket: { projectId: string; id: string }): string {
  return `/sales-operation/tracker/${ticket.projectId}?ticket=${ticket.id}`;
}

function slimTicket(ticket: TrackerTicket) {
  return {
    id: ticket.id,
    title: ticket.title,
    queue: ticket.projectName ?? null,
    queueId: ticket.projectId,
    status: ticket.statusName ?? null,
    done: ticket.statusIsDone ?? false,
    priority: ticket.priority,
    dueAt: ticket.dueAt,
    assignees: ticket.assignees.map((a) => a.userName ?? a.userId),
    url: ticketUrl(ticket),
  };
}

function actorOf(run: ToolRun) {
  return { userId: run.userId, name: run.userName };
}

async function findQueue(reference: string): Promise<TrackerProject | null> {
  const wanted = key(reference);
  if (!wanted) return null;
  const projects = await listTrackerProjects({ includeArchived: true });
  return (
    projects.find((project) => project.id === reference.trim()) ??
    projects.find((project) => key(project.name) === wanted) ??
    projects.find((project) => key(project.name).includes(wanted)) ??
    null
  );
}

async function queueNames(): Promise<string> {
  const projects = await listTrackerProjects({});
  return projects.length ? projects.map((project) => project.name).join(", ") : "none yet";
}

async function resolveStatus(
  projectId: string,
  reference: unknown,
): Promise<{ ok: true; status: TrackerStatus } | { ok: false; error: string }> {
  const statuses = await listTrackerStatuses(projectId);
  if (statuses.length === 0) return { ok: false, error: "This queue has no columns." };
  const wanted = typeof reference === "string" ? key(reference) : "";
  if (!wanted) {
    return { ok: true, status: statuses.find((status) => !status.isDone) ?? statuses[0] };
  }
  const match =
    statuses.find((status) => status.id === String(reference).trim()) ??
    statuses.find((status) => key(status.name) === wanted) ??
    statuses.find((status) => key(status.name).includes(wanted));
  if (!match) {
    return {
      ok: false,
      error: `Unknown column “${String(reference)}”. This queue has: ${statuses
        .map((status) => status.name)
        .join(", ")}.`,
    };
  }
  return { ok: true, status: match };
}

async function resolvePeople(
  values: unknown,
  run: ToolRun,
): Promise<
  { ok: true; people: Array<{ userId: string; userName: string }> } | { ok: false; error: string }
> {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  if (list.length === 0) return { ok: true, people: [] };
  const store = await loadAuthStore();
  const people: Array<{ userId: string; userName: string }> = [];
  for (const raw of list) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    if (SELF_WORDS.has(key(value)) || value === run.userId || key(value) === key(run.userName)) {
      people.push({ userId: run.userId, userName: run.userName });
      continue;
    }
    const wanted = key(value);
    const user =
      store.users.find((item) => item.id === value) ??
      store.users.find((item) => key(item.email ?? "") === wanted) ??
      store.users.find((item) => key(item.name ?? "") === wanted) ??
      store.users.find((item) => key(item.name ?? "").includes(wanted));
    if (!user) {
      return { ok: false, error: `No CRM user matches “${value}”. Use people.search to find the id.` };
    }
    people.push({ userId: user.id, userName: user.name });
  }
  const unique = new Map(people.map((person) => [person.userId, person]));
  return { ok: true, people: Array.from(unique.values()) };
}

async function resolveTicket(
  run: ToolRun,
): Promise<{ ok: true; ticket: TrackerTicket } | { ok: false; error: string }> {
  const ticketId = String(run.args.ticketId ?? "").trim();
  if (ticketId) {
    const ticket = await getTrackerTicket(ticketId);
    if (!ticket) return { ok: false, error: `Ticket ${ticketId} not found.` };
    return { ok: true, ticket };
  }
  const query = String(run.args.ticketQuery ?? run.args.title ?? "").trim();
  if (!query) return { ok: false, error: "ticketId or ticketQuery is required." };

  const queueRef = String(run.args.queue ?? "").trim();
  let candidates: TrackerTicket[] = [];
  if (queueRef) {
    const project = await findQueue(queueRef);
    if (!project) return { ok: false, error: `Queue “${queueRef}” not found. Existing: ${await queueNames()}.` };
    candidates = await listTrackerTickets(project.id, { q: query, includeArchived: true });
  } else {
    const projects = await listTrackerProjects({ includeArchived: true });
    for (const project of projects) {
      candidates.push(...(await listTrackerTickets(project.id, { q: query })));
    }
  }
  const wanted = key(query);
  const exact = candidates.filter((ticket) => key(ticket.title) === wanted);
  const pool = exact.length > 0 ? exact : candidates;
  if (pool.length === 0) return { ok: false, error: `No ticket matches “${query}”.` };
  if (pool.length > 1) {
    return {
      ok: false,
      error: `“${query}” matches ${pool.length} tickets: ${pool
        .slice(0, 5)
        .map((ticket) => `${ticket.title} (${ticket.id}, queue ${ticket.projectName ?? ticket.projectId})`)
        .join("; ")}. Pass ticketId.`,
    };
  }
  return { ok: true, ticket: pool[0] };
}

export async function trackerListQueues(run: ToolRun): Promise<AiToolResult> {
  const projects = await listTrackerProjects({
    includeArchived: Boolean(run.args.includeArchived),
  });
  const withColumns = await Promise.all(
    projects.slice(0, 25).map(async (project) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      openTickets: project.openTicketCount ?? 0,
      totalTickets: project.ticketCount ?? 0,
      archived: Boolean(project.archivedAt),
      columns: (await listTrackerStatuses(project.id)).map((status) => status.name),
    })),
  );
  return {
    ok: true,
    data: { count: projects.length, queues: withColumns },
    userMessage: projects.length
      ? `Tracker queues: ${projects.map((project) => project.name).join(", ")}.`
      : "No tracker queues yet.",
  };
}

export async function trackerCreateQueue(run: ToolRun): Promise<AiToolResult> {
  const forbidden = denied("editBoard", run);
  if (forbidden) return forbidden;
  const name = String(run.args.name ?? "").trim();
  if (!name) return { ok: false, error: "name is required" };
  const existing = await findQueue(name);
  if (existing && key(existing.name) === key(name)) {
    return {
      ok: true,
      data: { id: existing.id, name: existing.name, created: false },
      userMessage: `Queue “${existing.name}” already exists.`,
    };
  }
  const project = await createTrackerProject(
    { name, description: String(run.args.description ?? "") || null },
    actorOf(run),
  );
  const columns = await listTrackerStatuses(project.id);
  return {
    ok: true,
    data: {
      id: project.id,
      name: project.name,
      created: true,
      columns: columns.map((status) => status.name),
      url: `/sales-operation/tracker/${project.id}`,
    },
    userMessage: `Created queue “${project.name}” with columns ${columns
      .map((status) => status.name)
      .join(", ")}.`,
  };
}

export async function trackerListTickets(run: ToolRun): Promise<AiToolResult> {
  const queueRef = String(run.args.queue ?? "").trim();
  const query = String(run.args.query ?? "").trim();
  const includeDone = Boolean(run.args.includeDone);

  if (!queueRef) {
    const scope = run.args.scope === "created" ? "created" : "mine";
    const assignee = await resolvePeople(run.args.assignee, run);
    if (!assignee.ok) return { ok: false, error: assignee.error };
    const targetUserId = assignee.people[0]?.userId ?? run.userId;
    const tickets = await listMyTrackerTickets({ userId: targetUserId, scope, includeDone });
    const filtered = query
      ? tickets.filter((ticket) => key(ticket.title).includes(key(query)))
      : tickets;
    return {
      ok: true,
      data: { count: filtered.length, tickets: filtered.slice(0, 40).map(slimTicket) },
      userMessage: `${filtered.length} tracker tickets ${scope === "created" ? "created by" : "assigned to"} ${
        assignee.people[0]?.userName ?? run.userName
      }.`,
    };
  }

  const project = await findQueue(queueRef);
  if (!project) {
    return { ok: false, error: `Queue “${queueRef}” not found. Existing: ${await queueNames()}.` };
  }
  const assignee = await resolvePeople(run.args.assignee, run);
  if (!assignee.ok) return { ok: false, error: assignee.error };
  let tickets = await listTrackerTickets(project.id, {
    q: query || null,
    assigneeUserIds: assignee.people.map((person) => person.userId),
  });
  if (!includeDone) tickets = tickets.filter((ticket) => !ticket.statusIsDone);
  return {
    ok: true,
    data: {
      queue: project.name,
      queueId: project.id,
      count: tickets.length,
      tickets: tickets.slice(0, 60).map(slimTicket),
    },
    userMessage: `${tickets.length} tickets in “${project.name}”.`,
  };
}

export async function trackerGetTicket(run: ToolRun): Promise<AiToolResult> {
  const resolved = await resolveTicket(run);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const detail = await getTrackerTicket(resolved.ticket.id);
  if (!detail) return { ok: false, error: "Ticket not found." };
  return {
    ok: true,
    data: {
      ...slimTicket(detail),
      description: detail.description,
      checklist: detail.checklist.map((item) => ({ title: item.title, done: item.done })),
      comments: detail.comments.slice(-10).map((comment) => ({
        author: comment.authorName,
        body: comment.body,
        createdAt: comment.createdAt,
      })),
      subtasks: detail.subtasks.map((subtask) => subtask.title),
    },
  };
}

export async function trackerCreateTicket(run: ToolRun): Promise<AiToolResult> {
  const forbidden = denied("createTickets", run);
  if (forbidden) return forbidden;
  const title = String(run.args.title ?? "").trim();
  if (!title) return { ok: false, error: "title is required" };
  const queueRef = String(run.args.queue ?? "").trim();
  if (!queueRef) return { ok: false, error: "queue is required — pass the queue name or id." };

  let project = await findQueue(queueRef);
  let createdQueue = false;
  if (!project) {
    if (run.args.createQueueIfMissing === false) {
      return { ok: false, error: `Queue “${queueRef}” not found. Existing: ${await queueNames()}.` };
    }
    const cannotCreateQueue = denied("editBoard", run);
    if (cannotCreateQueue) {
      return {
        ok: false,
        status: "denied",
        error: `Queue “${queueRef}” does not exist and your role cannot create queues. Existing: ${await queueNames()}.`,
      };
    }
    project = await createTrackerProject({ name: queueRef }, actorOf(run));
    createdQueue = true;
  }

  const status = await resolveStatus(project.id, run.args.status);
  if (!status.ok) return { ok: false, error: status.error };
  const assignees = await resolvePeople(run.args.assignees, run);
  if (!assignees.ok) return { ok: false, error: assignees.error };
  if (assignees.people.length > 0) {
    const cannotAssign = denied("assignTickets", run);
    if (cannotAssign) return cannotAssign;
  }

  const ticket = await createTrackerTicket(
    project.id,
    {
      title,
      description: String(run.args.description ?? "") || null,
      statusId: status.status.id,
      priority: normalizeTrackerPriority(run.args.priority),
      dueAt: typeof run.args.dueAt === "string" ? run.args.dueAt : null,
      assigneeUserIds: assignees.people.map((person) => ({
        userId: person.userId,
        userName: person.userName,
      })),
    },
    actorOf(run),
  );

  const assigneeNames = ticket.assignees.map((a) => a.userName ?? a.userId).join(", ");
  return {
    ok: true,
    data: { ...slimTicket(ticket), createdQueue },
    uiBlocks: [
      {
        type: "task_preview",
        title: ticket.title,
        assignee: assigneeNames || undefined,
        dueAt: ticket.dueAt,
      },
    ],
    userMessage: `${createdQueue ? `Created queue “${project.name}” and ` : ""}added ticket “${
      ticket.title
    }” in ${status.status.name}${assigneeNames ? ` for ${assigneeNames}` : ""}.`,
  };
}

export async function trackerUpdateTicket(run: ToolRun): Promise<AiToolResult> {
  const forbidden = denied("createTickets", run);
  if (forbidden) return forbidden;
  const resolved = await resolveTicket(run);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const ticket = resolved.ticket;

  let statusId: string | undefined;
  if (run.args.status !== undefined) {
    const status = await resolveStatus(ticket.projectId, run.args.status);
    if (!status.ok) return { ok: false, error: status.error };
    statusId = status.status.id;
  }

  const updated = await updateTrackerTicket(
    ticket.id,
    {
      title: typeof run.args.newTitle === "string" ? run.args.newTitle : undefined,
      description: typeof run.args.description === "string" ? run.args.description : undefined,
      priority: run.args.priority === undefined ? undefined : normalizeTrackerPriority(run.args.priority),
      dueAt: typeof run.args.dueAt === "string" ? run.args.dueAt : undefined,
      statusId,
    },
    actorOf(run),
  );
  return {
    ok: true,
    data: slimTicket(updated),
    userMessage: `Updated “${updated.title}” — status ${updated.statusName ?? "unchanged"}, priority ${
      updated.priority
    }.`,
  };
}

export async function trackerAssignTicket(run: ToolRun): Promise<AiToolResult> {
  const forbidden = denied("assignTickets", run);
  if (forbidden) return forbidden;
  const resolved = await resolveTicket(run);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const people = await resolvePeople(run.args.assignees, run);
  if (!people.ok) return { ok: false, error: people.error };

  const keep = run.args.replace === false ? resolved.ticket.assignees : [];
  const merged = new Map(
    [...keep.map((a) => ({ userId: a.userId, userName: a.userName ?? a.userId })), ...people.people].map(
      (person) => [person.userId, person],
    ),
  );
  const assignees = await setTicketAssignees(
    resolved.ticket.id,
    Array.from(merged.values()),
    actorOf(run),
  );
  const names = assignees.map((a) => a.userName ?? a.userId).join(", ");
  return {
    ok: true,
    data: { ticketId: resolved.ticket.id, assignees: names },
    userMessage: names
      ? `“${resolved.ticket.title}” assigned to ${names}.`
      : `Cleared assignees on “${resolved.ticket.title}”.`,
  };
}

export async function trackerCommentTicket(run: ToolRun): Promise<AiToolResult> {
  const body = String(run.args.comment ?? "").trim();
  if (!body) return { ok: false, error: "comment is required" };
  const resolved = await resolveTicket(run);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const store = await loadAuthStore();
  await addTrackerComment(
    resolved.ticket.id,
    body,
    actorOf(run),
    store.users.map((user) => ({ id: user.id, name: user.name })),
  );
  return {
    ok: true,
    data: { ticketId: resolved.ticket.id },
    userMessage: `Commented on “${resolved.ticket.title}”.`,
  };
}

export async function trackerArchiveTicket(run: ToolRun): Promise<AiToolResult> {
  const forbidden = denied("archiveTickets", run);
  if (forbidden) return forbidden;
  const resolved = await resolveTicket(run);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  const archived = run.args.archived === false ? false : true;
  const ticket = await archiveTrackerTicket(resolved.ticket.id, actorOf(run), archived);
  return {
    ok: true,
    data: slimTicket(ticket),
    userMessage: archived
      ? `Archived “${ticket.title}”. It can be restored.`
      : `Restored “${ticket.title}”.`,
  };
}

export async function trackerDeleteTicket(run: ToolRun): Promise<AiToolResult> {
  const forbidden = denied("deleteTickets", run);
  if (forbidden) return forbidden;
  const resolved = await resolveTicket(run);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  await deleteTrackerTicket(resolved.ticket.id);
  return {
    ok: true,
    data: { ticketId: resolved.ticket.id },
    userMessage: `Deleted “${resolved.ticket.title}” permanently.`,
  };
}
