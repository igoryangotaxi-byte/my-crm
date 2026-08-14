import { loadAuthStore } from "@/lib/auth-store";
import { getPlatformStaffUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { listSalesTasksWithLead } from "@/lib/sales-operation/tasks";
import { listMeetingsForUser } from "@/lib/sales-operation/meetings";
import type { AiToolResult } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

function staffMatches(query: string, name: string, email?: string) {
  const q = query.toLowerCase();
  return name.toLowerCase().includes(q) || (email ?? "").toLowerCase().includes(q);
}

export async function peopleSearch(run: ToolRun): Promise<AiToolResult> {
  const store = await loadAuthStore();
  const query = String(run.args.query ?? "").trim();
  if (!query) return { ok: false, error: "query is required" };
  const staff = getPlatformStaffUserOptions(store.users);
  const users = store.users.filter((user) => staff.some((s) => s.id === user.id));
  const hits = users
    .filter((user) => staffMatches(query, user.name, user.email))
    .map((user) => ({ id: user.id, name: user.name, email: user.email, role: user.role }));
  return { ok: true, data: hits, userMessage: hits.length ? `Found ${hits.length} people.` : "No people matched." };
}

export async function peopleGet(run: ToolRun): Promise<AiToolResult> {
  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === String(run.args.userId ?? ""));
  if (!user) return { ok: false, error: "Person not found." };
  return {
    ok: true,
    data: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

export async function peopleWorkload(run: ToolRun): Promise<AiToolResult> {
  const userId = String(run.args.userId ?? "");
  const store = await loadAuthStore();
  const user = store.users.find((item) => item.id === userId);
  if (!user) return { ok: false, error: "Person not found." };
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const [tasks, meetings] = await Promise.all([
    listSalesTasksWithLead({ assignedToUserId: userId, statuses: ["open"] }),
    listMeetingsForUser(userId, { from: start.toISOString(), to: end.toISOString() }).catch(() => []),
  ]);
  const overdue = tasks.filter((task) => task.dueAt && new Date(task.dueAt).getTime() < now.getTime());
  const load =
    overdue.length >= 5 || tasks.length >= 12 || meetings.length >= 6
      ? "High"
      : overdue.length >= 2 || tasks.length >= 6 || meetings.length >= 4
        ? "Medium"
        : "Low";
  return {
    ok: true,
    data: {
      userId,
      name: user.name,
      openTasks: tasks.length,
      overdue: overdue.length,
      meetingsToday: meetings.length,
      load,
      note: "Operational signal only — not a performance evaluation.",
    },
    userMessage: `${user.name}: ${tasks.length} open tasks, ${overdue.length} overdue, ${meetings.length} meetings today. Load: ${load}.`,
  };
}
