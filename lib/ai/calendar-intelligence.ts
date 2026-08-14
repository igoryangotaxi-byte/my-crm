export type CalendarBusyBlock = {
  start: string;
  end: string;
  title?: string;
};

export type UnifiedCalendarEntry = {
  source: "google" | "crm";
  title: string;
  start: string;
  end: string;
  googleEventId: string | null;
  crmMeetingId: string | null;
  attendees: string[];
  htmlLink: string | null;
};

function normalizeTitle(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Same instant may be written as UTC or with an offset, so compare epoch millis. */
function fingerprint(start: string, end: string, title: string): string {
  return `${Date.parse(start)}|${Date.parse(end)}|${normalizeTitle(title)}`;
}

/**
 * A meeting booked through the assistant exists twice: as a Google event and as
 * its `sales_meetings` mirror. Reporting both would tell the user they have two
 * meetings when they have one, so mirrors are folded into the Google entry.
 */
export function mergeCalendarEntries(input: {
  google: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    attendees?: string[];
    htmlLink?: string | null;
  }>;
  crm: Array<{
    id: string;
    title: string;
    startsAt: string;
    endsAt: string;
    googleEventId?: string | null;
  }>;
}): UnifiedCalendarEntry[] {
  const entries: UnifiedCalendarEntry[] = input.google.map((event) => ({
    source: "google",
    title: event.title,
    start: event.startsAt,
    end: event.endsAt,
    googleEventId: event.id,
    crmMeetingId: null,
    attendees: event.attendees ?? [],
    htmlLink: event.htmlLink ?? null,
  }));

  const byGoogleId = new Map<string, UnifiedCalendarEntry>();
  const byFingerprint = new Map<string, UnifiedCalendarEntry>();
  for (const entry of entries) {
    if (entry.googleEventId) byGoogleId.set(entry.googleEventId, entry);
    byFingerprint.set(fingerprint(entry.start, entry.end, entry.title), entry);
  }

  for (const meeting of input.crm) {
    const linked = meeting.googleEventId ? byGoogleId.get(meeting.googleEventId) : undefined;
    const mirrored = linked ?? byFingerprint.get(fingerprint(meeting.startsAt, meeting.endsAt, meeting.title));
    if (mirrored) {
      mirrored.crmMeetingId = meeting.id;
      continue;
    }
    const entry: UnifiedCalendarEntry = {
      source: "crm",
      title: meeting.title,
      start: meeting.startsAt,
      end: meeting.endsAt,
      googleEventId: meeting.googleEventId ?? null,
      crmMeetingId: meeting.id,
      attendees: [],
      htmlLink: null,
    };
    entries.push(entry);
    byFingerprint.set(fingerprint(entry.start, entry.end, entry.title), entry);
  }

  return entries.sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

export type CalendarLoadBreakdown = {
  meetingHours: number;
  meetingsPerDay: number;
  consecutiveBlocks: number;
  longestContinuousMinutes: number;
  freeMinutes: number;
  fragmentation: number;
  afterHoursMinutes: number;
  score: number;
  reasons: string[];
};

function parseHm(value: string): number {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function minutesBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return (end - start) / 60000;
}

function localMinutes(iso: string, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

export function computeCalendarLoadScore(input: {
  events: CalendarBusyBlock[];
  timeZone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  dayStartIso: string;
  dayEndIso: string;
}): CalendarLoadBreakdown {
  const workStart = parseHm(input.workingHoursStart);
  const workEnd = parseHm(input.workingHoursEnd);
  const workMinutes = Math.max(1, workEnd - workStart);
  const sorted = [...input.events]
    .map((event) => ({
      ...event,
      startMs: new Date(event.start).getTime(),
      endMs: new Date(event.end).getTime(),
    }))
    .filter((event) => Number.isFinite(event.startMs) && event.endMs > event.startMs)
    .sort((a, b) => a.startMs - b.startMs);

  let meetingMinutes = 0;
  let consecutive = 0;
  let longest = 0;
  let fragmentation = 0;
  let afterHours = 0;
  let chain = 0;

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i];
    const duration = (event.endMs - event.startMs) / 60000;
    meetingMinutes += duration;
    longest = Math.max(longest, duration);
    const startMin = localMinutes(event.start, input.timeZone);
    const endMin = localMinutes(event.end, input.timeZone);
    if (startMin < workStart) afterHours += workStart - startMin;
    if (endMin > workEnd) afterHours += endMin - workEnd;

    if (i > 0) {
      const gap = (event.startMs - sorted[i - 1].endMs) / 60000;
      if (gap >= 0 && gap < 10) {
        consecutive += 1;
        chain += duration;
        longest = Math.max(longest, chain + (sorted[i - 1].endMs - sorted[i - 1].startMs) / 60000);
      } else {
        chain = duration;
        if (gap >= 10 && gap <= 45) fragmentation += 1;
      }
    } else {
      chain = duration;
    }
  }

  const meetingHours = meetingMinutes / 60;
  const consecutivePenalty = consecutive * 0.5;
  const fragmentationPenalty = fragmentation * 0.3;
  const afterHoursPenalty = afterHours / 60;
  const score = Number(
    (meetingHours + consecutivePenalty + fragmentationPenalty + afterHoursPenalty).toFixed(2),
  );
  const freeMinutes = Math.max(0, workMinutes - meetingMinutes);
  const reasons: string[] = [];
  if (meetingHours >= 5) reasons.push(`${meetingHours.toFixed(1)}h of meetings`);
  if (consecutive >= 2) reasons.push(`${consecutive} back-to-back meetings (gap < 10m)`);
  if (fragmentation >= 2) reasons.push(`${fragmentation} fragmented gaps (10–45m)`);
  if (afterHours >= 30) reasons.push(`${Math.round(afterHours)}m outside working hours`);
  if (reasons.length === 0 && meetingHours > 0) {
    reasons.push("Load is moderate — no single penalty dominates");
  }
  if (sorted.length === 0) reasons.push("No meetings in this window");

  const daySpanHours = minutesBetween(input.dayStartIso, input.dayEndIso) / 60 || 1;

  return {
    meetingHours: Number(meetingHours.toFixed(2)),
    meetingsPerDay: Number((sorted.length / Math.max(1, daySpanHours / 24)).toFixed(2)),
    consecutiveBlocks: consecutive,
    longestContinuousMinutes: Math.round(longest),
    freeMinutes: Math.round(freeMinutes),
    fragmentation,
    afterHoursMinutes: Math.round(afterHours),
    score,
    reasons,
  };
}

/**
 * Guards against a model that guessed the date instead of resolving it from "now".
 * A meeting written into the past silently disappears from every upcoming view.
 */
export function validateEventWindow(input: {
  startsAt: string;
  endsAt: string;
  now?: Date;
  pastToleranceMinutes?: number;
}): { ok: true } | { ok: false; error: string } {
  const start = new Date(input.startsAt).getTime();
  const end = new Date(input.endsAt).getTime();
  if (!Number.isFinite(start)) {
    return { ok: false, error: `startsAt is not a valid ISO 8601 timestamp: ${input.startsAt}` };
  }
  if (!Number.isFinite(end)) {
    return { ok: false, error: `endsAt is not a valid ISO 8601 timestamp: ${input.endsAt}` };
  }
  if (end <= start) {
    return { ok: false, error: "endsAt must be after startsAt." };
  }
  const now = (input.now ?? new Date()).getTime();
  const tolerance = (input.pastToleranceMinutes ?? 60) * 60000;
  if (start < now - tolerance) {
    return {
      ok: false,
      error: `Refusing to schedule in the past: ${input.startsAt}. Re-resolve the date from the current date and try again.`,
    };
  }
  return { ok: true };
}

export function findOverlappingBusy(
  events: CalendarBusyBlock[],
  startIso: string,
  endIso: string,
): CalendarBusyBlock[] {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
  return events.filter((event) => {
    const eventStart = new Date(event.start).getTime();
    const eventEnd = new Date(event.end).getTime();
    if (!Number.isFinite(eventStart) || !Number.isFinite(eventEnd)) return false;
    return eventStart < end && eventEnd > start;
  });
}

export function findBestSlots(input: {
  events: CalendarBusyBlock[];
  fromIso: string;
  toIso: string;
  durationMinutes: number;
  timeZone: string;
  workingHoursStart: string;
  workingHoursEnd: string;
  avoidStart: string;
  avoidEnd: string;
  bufferMinutes?: number;
  limit?: number;
}): Array<{ start: string; end: string; reason: string; score: number }> {
  const buffer = input.bufferMinutes ?? 15;
  const durationMs = input.durationMinutes * 60000;
  const workStart = parseHm(input.workingHoursStart);
  const workEnd = parseHm(input.workingHoursEnd);
  const avoidStart = parseHm(input.avoidStart);
  const avoidEnd = parseHm(input.avoidEnd);
  const from = new Date(input.fromIso).getTime();
  const to = new Date(input.toIso).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const busy = [...input.events]
    .map((event) => ({
      start: new Date(event.start).getTime(),
      end: new Date(event.end).getTime(),
    }))
    .filter((event) => event.end > from && event.start < to)
    .sort((a, b) => a.start - b.start);

  const candidates: Array<{ start: string; end: string; reason: string; score: number }> = [];
  const step = 15 * 60000;
  for (let t = from; t + durationMs <= to; t += step) {
    const startDate = new Date(t);
    const endDate = new Date(t + durationMs);
    const startMin = localMinutes(startDate.toISOString(), input.timeZone);
    const endMin = localMinutes(endDate.toISOString(), input.timeZone);
    if (startMin < workStart || endMin > workEnd) continue;
    if (startMin < avoidEnd && endMin > avoidStart) continue;

    const overlaps = busy.some((block) => t < block.end && t + durationMs > block.start);
    if (overlaps) continue;

    const prev = [...busy].reverse().find((block) => block.end <= t);
    const next = busy.find((block) => block.start >= t + durationMs);
    const gapBefore = prev ? (t - prev.end) / 60000 : 999;
    const gapAfter = next ? (next.start - (t + durationMs)) / 60000 : 999;
    if (gapBefore < buffer || gapAfter < buffer) continue;

    let score = Math.min(gapBefore, 120) / 30 + Math.min(gapAfter, 120) / 30;
    const reasons: string[] = [];
    if (gapBefore >= 45 && gapAfter >= 45) {
      score += 2;
      reasons.push("buffer on both sides");
    } else {
      reasons.push(`${Math.round(Math.min(gapBefore, gapAfter))}m nearest buffer`);
    }
    if (startMin < 12 * 60) {
      score += 0.4;
      reasons.push("morning slot");
    }
    candidates.push({
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      reason: reasons.join("; "),
      score,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  const unique: typeof candidates = [];
  for (const slot of candidates) {
    if (unique.some((existing) => Math.abs(new Date(existing.start).getTime() - new Date(slot.start).getTime()) < 20 * 60000)) {
      continue;
    }
    unique.push(slot);
    if (unique.length >= (input.limit ?? 3)) break;
  }
  return unique;
}
