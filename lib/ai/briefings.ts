import { listMeetingsForUser } from "@/lib/sales-operation/meetings";
import { listSalesTasksWithLead } from "@/lib/sales-operation/tasks";
import { listPersonalTasks } from "@/lib/sales-operation/personal-space";
import { getCalendarTokens, listGoogleCalendarEvents } from "@/lib/google/calendar";
import { computeCalendarLoadScore, mergeCalendarEntries } from "@/lib/ai/calendar-intelligence";
import { getAiPreferences } from "@/lib/ai/repository";
import { createNotification } from "@/lib/sales-operation/notifications";

export async function buildTomorrowBriefing(userId: string, email: string): Promise<string> {
  const prefs = await getAiPreferences(userId);
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() + 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  const weekday = start.toLocaleDateString("en-US", { weekday: "long", timeZone: prefs.timezone });
  const crm = await listMeetingsForUser(userId, { from: start.toISOString(), to: end.toISOString() }).catch(() => []);
  const google = (await getCalendarTokens(userId))
    ? await listGoogleCalendarEvents(userId, { from: start.toISOString(), to: end.toISOString() }).catch(() => [])
    : [];
  const events = mergeCalendarEntries({ google, crm }).map((entry) => ({
    start: entry.start,
    end: entry.end,
    title: entry.title,
  }));
  const load = computeCalendarLoadScore({
    events,
    timeZone: prefs.timezone,
    workingHoursStart: prefs.workingHoursStart,
    workingHoursEnd: prefs.workingHoursEnd,
    dayStartIso: start.toISOString(),
    dayEndIso: end.toISOString(),
  });
  const tasks = await listSalesTasksWithLead({ assignedToUserId: userId, statuses: ["open"] });
  const personal = await listPersonalTasks({ userId, email }, ["open"]).catch(() => []);
  const due = [...tasks, ...personal].filter((task) => {
    if (!task.dueAt) return false;
    const dueTime = new Date(task.dueAt).getTime();
    return dueTime >= start.getTime() && dueTime <= end.getTime();
  });
  const lines = [
    `Tomorrow — ${weekday}`,
    `Meetings: ${events.length}`,
    `Total meeting time: ${load.meetingHours.toFixed(1)}h`,
    "",
    ...events.slice(0, 8).map((event) => {
      const t = new Date(event.start).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: prefs.timezone,
      });
      return `${t} ${event.title}`;
    }),
    "",
    `Tasks due tomorrow: ${due.length}`,
    `Load score: ${load.score} (${load.reasons.join("; ")})`,
  ];
  if (load.score >= 6) {
    lines.push("", "Suggestion: move one non-critical meeting to free a 2-hour focus block.");
  }
  return lines.join("\n");
}

export async function deliverBriefing(userId: string, email: string, title: string): Promise<void> {
  const body = await buildTomorrowBriefing(userId, email);
  await createNotification({
    userId,
    type: "system",
    title,
    body,
    link: "/sales-operation/calendar",
  });
}
