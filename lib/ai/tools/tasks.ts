import {
  canAccessSalesTask,
  createSalesTask,
  getSalesTaskById,
  listSalesTasksWithLead,
  updateSalesTask,
} from "@/lib/sales-operation/tasks";
import {
  createPersonalTask,
  listPersonalTasks,
  updatePersonalTask,
} from "@/lib/sales-operation/personal-space";
import { loadAuthStore } from "@/lib/auth-store";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";
import type { SalesTaskPriority, SalesTaskStatus } from "@/lib/sales-operation/types";

function toPriority(value: unknown): SalesTaskPriority | undefined {
  if (value === "low" || value === "normal" || value === "high") return value;
  if (value === "medium") return "normal";
  return undefined;
}

export async function tasksSearch(run: ToolRun): Promise<AiToolResult> {
  const scope = String(run.args.scope ?? "mine");
  const query = String(run.args.query ?? "").toLowerCase();
  const overdueOnly = Boolean(run.args.overdueOnly);
  const statusRaw = String(run.args.status ?? "open");
  const statuses: SalesTaskStatus[] =
    statusRaw === "all" ? ["open", "done"] : statusRaw === "done" ? ["done"] : ["open"];
  const assignee = String(run.args.assigneeUserId ?? "") || (scope === "all" ? "" : run.userId);

  if (scope === "personal") {
    const tasks = await listPersonalTasks({ userId: run.userId, email: run.userEmail }, statuses);
    const now = Date.now();
    const filtered = tasks.filter((task) => {
      if (query && !task.title.toLowerCase().includes(query)) return false;
      if (overdueOnly) return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now && task.status === "open");
      return true;
    });
    return { ok: true, data: filtered.slice(0, 30) };
  }

  const tasks = await listSalesTasksWithLead({
    assignedToUserId: scope === "created" ? null : assignee || null,
    createdByUserId: scope === "created" ? run.userId : null,
    statuses,
  });
  const now = Date.now();
  const filtered = tasks.filter((task) => {
    if (query && !`${task.title} ${task.leadCompanyName ?? ""}`.toLowerCase().includes(query)) return false;
    if (overdueOnly) return Boolean(task.dueAt && new Date(task.dueAt).getTime() < now && task.status === "open");
    return true;
  });
  return {
    ok: true,
    data: filtered.slice(0, 40).map((task) => ({
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      dueAt: task.dueAt,
      assignedToName: task.assignedToName,
      assignedToUserId: task.assignedToUserId,
      leadId: task.leadId,
      leadName: task.leadName,
      company: task.leadCompanyName,
    })),
    userMessage: `Found ${Math.min(filtered.length, 40)} tasks.`,
  };
}

export async function tasksGet(run: ToolRun): Promise<AiToolResult> {
  const task = await getSalesTaskById(String(run.args.taskId ?? ""));
  if (!task) return { ok: false, error: "Task not found." };
  if (!canAccessSalesTask(task, { id: run.userId, role: run.role })) {
    return { ok: false, status: "denied", error: "You cannot view this task." };
  }
  return { ok: true, data: task };
}

export async function tasksCreate(run: ToolRun): Promise<AiToolResult> {
  const title = String(run.args.title ?? "").trim();
  if (!title) return { ok: false, error: "title is required" };
  const leadId = String(run.args.leadId ?? "").trim();
  const dueAt = typeof run.args.dueAt === "string" ? run.args.dueAt : null;
  if (!leadId) {
    const task = await createPersonalTask(
      { userId: run.userId, email: run.userEmail },
      { title, description: String(run.args.description ?? "") || null, dueAt, priority: toPriority(run.args.priority) ?? "normal" },
    );
    return {
      ok: true,
      data: task,
      uiBlocks: [{ type: "task_preview", title: task.title, dueAt: task.dueAt }],
      userMessage: `Created personal task “${task.title}”.`,
    };
  }
  const store = await loadAuthStore();
  const assigneeId = String(run.args.assigneeUserId ?? run.userId);
  const assignee = store.users.find((user) => user.id === assigneeId);
  const task = await createSalesTask(
    leadId,
    {
      title,
      description: String(run.args.description ?? "") || null,
      dueAt,
      assignedToUserId: assigneeId,
      assignedToName: assignee?.name ?? run.userName,
      priority: toPriority(run.args.priority) ?? "normal",
    },
    { userId: run.userId, name: run.userName },
  );
  return {
    ok: true,
    data: task,
    uiBlocks: [
      {
        type: "task_preview",
        title: task.title,
        assignee: task.assignedToName,
        dueAt: task.dueAt,
      },
    ],
    userMessage: `Created task “${task.title}”.`,
  };
}

export async function tasksUpdate(run: ToolRun): Promise<AiToolResult> {
  const taskId = String(run.args.taskId ?? "");
  if (run.args.personal) {
    const task = await updatePersonalTask(
      { userId: run.userId, email: run.userEmail },
      taskId,
      {
        status: run.args.status as SalesTaskStatus | undefined,
        dueAt: typeof run.args.dueAt === "string" ? run.args.dueAt : undefined,
        title: typeof run.args.title === "string" ? run.args.title : undefined,
      },
    );
    return { ok: true, data: task, userMessage: "Updated personal task." };
  }
  const existing = await getSalesTaskById(taskId);
  if (!existing) return { ok: false, error: "Task not found." };
  if (!canAccessSalesTask(existing, { id: run.userId, role: run.role })) {
    return { ok: false, status: "denied", error: "You cannot update this task." };
  }
  const task = await updateSalesTask(
    taskId,
    {
      status: run.args.status as SalesTaskStatus | undefined,
      dueAt: typeof run.args.dueAt === "string" ? run.args.dueAt : undefined,
      title: typeof run.args.title === "string" ? run.args.title : undefined,
      priority: toPriority(run.args.priority),
    },
    { userId: run.userId, name: run.userName },
  );
  return { ok: true, data: task, userMessage: "Updated task." };
}

export async function tasksAssign(run: ToolRun): Promise<AiToolResult> {
  const store = await loadAuthStore();
  const assigneeId = String(run.args.assigneeUserId ?? "");
  const assignee = store.users.find((user) => user.id === assigneeId);
  if (!assignee) return { ok: false, error: "Assignee not found." };
  const task = await updateSalesTask(
    String(run.args.taskId ?? ""),
    { assignedToUserId: assigneeId, assignedToName: assignee.name },
    { userId: run.userId, name: run.userName },
  );
  return { ok: true, data: task, userMessage: `Assigned to ${assignee.name}.` };
}

export async function tasksComment(run: ToolRun): Promise<AiToolResult> {
  const comment = String(run.args.comment ?? "").trim();
  if (!comment) return { ok: false, error: "comment is required" };
  const existing = await getSalesTaskById(String(run.args.taskId ?? ""));
  if (!existing) return { ok: false, error: "Task not found." };
  const summary = [existing.resultSummary, `${run.userName}: ${comment}`].filter(Boolean).join("\n");
  const task = await updateSalesTask(
    existing.id,
    { resultSummary: summary },
    { userId: run.userId, name: run.userName },
  );
  return { ok: true, data: { id: task.id }, userMessage: "Comment added." };
}
