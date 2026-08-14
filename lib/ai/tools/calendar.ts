import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  getCalendarTokens,
  listGoogleCalendarEvents,
  queryGoogleFreeBusy,
  updateGoogleCalendarEvent,
} from "@/lib/google/calendar";
import {
  createMeeting,
  deleteMeeting,
  getMeetingById,
  listMeetingsForUser,
  updateMeeting,
} from "@/lib/sales-operation/meetings";
import { getAiPreferences } from "@/lib/ai/repository";
import {
  computeCalendarLoadScore,
  findBestSlots,
  findOverlappingBusy,
  mergeCalendarEntries,
  validateEventWindow,
} from "@/lib/ai/calendar-intelligence";
import { createConfirmation } from "@/lib/ai/repository";
import type { AiToolResult, AiUiBlock } from "@/lib/ai/types";
import type { ToolRun } from "@/lib/ai/tool-gateway/types";

const CALENDAR_CONNECT_BLOCK: AiUiBlock = {
  type: "connect",
  integration: "googleCalendar",
  text: "Connect Google Calendar in Settings → Integrations to read and schedule meetings.",
};

function needsCalendarConnect(): AiToolResult {
  return {
    ok: false,
    error: "Google Calendar is not connected.",
    uiBlocks: [CALENDAR_CONNECT_BLOCK],
    userMessage: "Google Calendar is disconnected. Connect it to continue.",
  };
}

async function loadBusy(run: ToolRun, from: string, to: string) {
  const crm = await listMeetingsForUser(run.userId, { from, to }).catch(() => []);
  const google = (await getCalendarTokens(run.userId))
    ? await listGoogleCalendarEvents(run.userId, { from, to }).catch(() => [])
    : [];
  const merged = mergeCalendarEntries({ google, crm });
  const events = merged.map((entry) => ({ start: entry.start, end: entry.end, title: entry.title }));
  return { crm, google, merged, events };
}

export async function calendarGetEvents(run: ToolRun): Promise<AiToolResult> {
  const from = String(run.args.from ?? "");
  const to = String(run.args.to ?? "");
  if (!from || !to) return { ok: false, error: "from and to are required" };
  const connected = Boolean(await getCalendarTokens(run.userId));
  const { merged } = await loadBusy(run, from, to);
  const count = merged.length;
  const summary = count === 1 ? "1 meeting" : `${count} meetings`;
  return {
    ok: true,
    data: {
      count,
      events: merged.map((entry) => ({
        title: entry.title,
        start: entry.start,
        end: entry.end,
        attendees: entry.attendees,
        source: entry.source,
        eventId: entry.googleEventId ?? entry.crmMeetingId,
      })),
      googleCalendarConnected: connected,
    },
    uiBlocks: connected ? undefined : [CALENDAR_CONNECT_BLOCK],
    userMessage: connected
      ? `${summary} in that window.`
      : `${summary} from CRM only — Google Calendar is not connected.`,
  };
}

export async function calendarGetFreeBusy(run: ToolRun): Promise<AiToolResult> {
  const from = String(run.args.from ?? "");
  const to = String(run.args.to ?? "");
  if (!(await getCalendarTokens(run.userId))) return needsCalendarConnect();
  const busy = await queryGoogleFreeBusy(run.userId, { from, to });
  return { ok: true, data: busy };
}

export async function calendarFindSlots(run: ToolRun): Promise<AiToolResult> {
  const from = String(run.args.from ?? "");
  const to = String(run.args.to ?? "");
  if (!(await getCalendarTokens(run.userId))) return needsCalendarConnect();
  const prefs = await getAiPreferences(run.userId);
  const { events } = await loadBusy(run, from, to);
  const duration = Number(run.args.durationMinutes ?? prefs.preferredMeetingMinutes) || 30;
  const slots = findBestSlots({
    events,
    fromIso: from,
    toIso: to,
    durationMinutes: duration,
    timeZone: prefs.timezone,
    workingHoursStart: prefs.workingHoursStart,
    workingHoursEnd: prefs.workingHoursEnd,
    avoidStart: prefs.avoidStart,
    avoidEnd: prefs.avoidEnd,
  });
  return {
    ok: true,
    data: slots,
    uiBlocks: [{ type: "meeting_slots", slots }],
    userMessage: slots.length
      ? `Best slots: ${slots.map((s) => new Date(s.start).toLocaleString()).join("; ")}`
      : "No suitable slots in that window.",
  };
}

export async function calendarAnalyzeLoad(run: ToolRun): Promise<AiToolResult> {
  const from = String(run.args.from ?? "");
  const to = String(run.args.to ?? "");
  if (!(await getCalendarTokens(run.userId))) return needsCalendarConnect();
  const prefs = await getAiPreferences(run.userId);
  const { events } = await loadBusy(run, from, to);
  const load = computeCalendarLoadScore({
    events,
    timeZone: prefs.timezone,
    workingHoursStart: prefs.workingHoursStart,
    workingHoursEnd: prefs.workingHoursEnd,
    dayStartIso: from,
    dayEndIso: to,
  });
  return {
    ok: true,
    data: load,
    uiBlocks: [
      {
        type: "metric",
        title: "Calendar load",
        fact: `Score ${load.score} = ${load.meetingHours}h meetings + ${load.consecutiveBlocks}×0.5 consecutive + ${load.fragmentation}×0.3 fragmentation + ${load.afterHoursMinutes}m after-hours.`,
        inference: load.reasons.join(" "),
      },
    ],
  };
}

export async function calendarCreateEvent(run: ToolRun): Promise<AiToolResult> {
  if (!(await getCalendarTokens(run.userId))) return needsCalendarConnect();
  const title = String(run.args.title ?? "").trim();
  const startsAt = String(run.args.startsAt ?? "");
  const endsAt = String(run.args.endsAt ?? "");
  if (!title || !startsAt || !endsAt) return { ok: false, error: "title, startsAt, endsAt required" };
  const window = validateEventWindow({ startsAt, endsAt });
  if (!window.ok) {
    return { ok: false, error: window.error, userMessage: window.error };
  }
  const attendees = Array.isArray(run.args.attendeeEmails)
    ? run.args.attendeeEmails.map(String)
    : [];
  const prefs = await getAiPreferences(run.userId);
  const { events } = await loadBusy(run, startsAt, endsAt);
  const conflicts = findOverlappingBusy(events, startsAt, endsAt);
  if (conflicts.length > 0 && run.args.ignoreConflicts !== true) {
    const token = await createConfirmation({
      userId: run.userId,
      tool: "calendar.create_event",
      args: { ...run.args, ignoreConflicts: true },
      preview: { title, startsAt, endsAt, conflicts },
    });
    const names = conflicts.map((event) => event.title || "busy").join(", ");
    return {
      ok: true,
      status: "needs_confirmation",
      confirmToken: token,
      uiBlocks: [
        {
          type: "confirmation",
          token,
          title: "Calendar conflict",
          body: `“${title}” overlaps: ${names}. Confirm to book anyway.`,
          tool: "calendar.create_event",
        },
      ],
      userMessage: `This time conflicts with ${names}. Confirm if you still want to book it.`,
    };
  }
  const googleEventId = await createGoogleCalendarEvent(run.userId, {
    title,
    description: String(run.args.description ?? "") || null,
    startsAt,
    endsAt,
    attendees,
    timeZone: prefs.timezone,
    conference: prefs.meetingProvider === "google_meet",
  });
  let meetingId: string | null = null;
  const clientId = String(run.args.clientId ?? "") || null;
  const meeting = await createMeeting(run.userId, {
    title,
    description: String(run.args.description ?? "") || null,
    startsAt,
    endsAt,
    clientId,
    googleEventId,
  });
  meetingId = meeting.id;
  return {
    ok: true,
    data: { googleEventId, meetingId },
    uiBlocks: [
      {
        type: "meeting_preview",
        title,
        start: startsAt,
        end: endsAt,
        attendees,
      },
    ],
    userMessage: `Created “${title}”.`,
  };
}

export async function calendarUpdateEvent(run: ToolRun): Promise<AiToolResult> {
  const eventId = String(run.args.eventId ?? "");
  const title = String(run.args.title ?? "Meeting");
  const startsAt = String(run.args.startsAt ?? "");
  const endsAt = String(run.args.endsAt ?? "");
  if (startsAt && endsAt) {
    const window = validateEventWindow({ startsAt, endsAt });
    if (!window.ok) {
      return { ok: false, error: window.error, userMessage: window.error };
    }
  }
  const crm = await getMeetingById(eventId).catch(() => null);
  if (crm && crm.userId === run.userId) {
    await updateMeeting(run.userId, eventId, {
      title: typeof run.args.title === "string" ? title : crm.title,
      startsAt: startsAt || crm.startsAt,
      endsAt: endsAt || crm.endsAt,
      description: typeof run.args.description === "string" ? String(run.args.description) : crm.description,
    });
    if (crm.googleEventId) {
      await updateGoogleCalendarEvent(run.userId, crm.googleEventId, {
        title: typeof run.args.title === "string" ? title : crm.title,
        startsAt: startsAt || crm.startsAt,
        endsAt: endsAt || crm.endsAt,
        description: typeof run.args.description === "string" ? String(run.args.description) : crm.description,
      }).catch(() => null);
    }
    return { ok: true, userMessage: "Meeting updated." };
  }
  if (startsAt && endsAt) {
    await updateGoogleCalendarEvent(run.userId, eventId, {
      title,
      startsAt,
      endsAt,
      description: String(run.args.description ?? "") || null,
    });
  }
  return { ok: true, userMessage: "Calendar event updated." };
}

export async function calendarCancelEvent(run: ToolRun): Promise<AiToolResult> {
  const eventId = String(run.args.eventId ?? "");
  const crm = await getMeetingById(eventId).catch(() => null);
  if (crm && crm.userId === run.userId) {
    if (crm.googleEventId) await deleteGoogleCalendarEvent(run.userId, crm.googleEventId).catch(() => null);
    await deleteMeeting(run.userId, eventId);
    return { ok: true, userMessage: "Meeting cancelled." };
  }
  await deleteGoogleCalendarEvent(run.userId, eventId);
  return { ok: true, userMessage: "Calendar event cancelled." };
}
