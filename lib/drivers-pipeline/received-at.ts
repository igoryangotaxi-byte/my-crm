import type { DriverLead } from "@/lib/drivers-pipeline/types";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Sheet column A values look like `26/09/2025 12:39` (DD/MM/YYYY [HH:mm]).
 * Falls back to ISO / Date.parse for webhook/manual leads.
 *
 * Ambiguous pairs (both parts ≤ 12) are primarily DD/MM (IL sheets). If that
 * lands more than ~1 day in the future, we try MM/DD (common US export of the
 * same cell) so `09/12/2026` meaning 12 Sep does not become 9 Dec.
 */
export function parseDriverReceivedRaw(
  raw: string | null | undefined,
  options?: { now?: Date },
): Date | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const sheet = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (sheet) {
    const first = Number(sheet[1]);
    const second = Number(sheet[2]);
    const year = Number(sheet[3]);
    const hour = Number(sheet[4] ?? 0);
    const minute = Number(sheet[5] ?? 0);
    const secondOfMinute = Number(sheet[6] ?? 0);
    const now = options?.now ?? new Date();
    const futureLimit = now.getTime() + DAY_MS;

    const asDayMonth = buildLocalDate(first, second, year, hour, minute, secondOfMinute);
    const asMonthDay =
      first !== second && first <= 12 && second <= 12
        ? buildLocalDate(second, first, year, hour, minute, secondOfMinute)
        : null;

    if (asDayMonth && asDayMonth.getTime() <= futureLimit) return asDayMonth;
    if (asMonthDay && asMonthDay.getTime() <= futureLimit) return asMonthDay;

    if (asDayMonth && asMonthDay) {
      const dayMonthDelta = Math.abs(asDayMonth.getTime() - now.getTime());
      const monthDayDelta = Math.abs(asMonthDay.getTime() - now.getTime());
      return monthDayDelta < dayMonthDelta ? asMonthDay : asDayMonth;
    }
    return asDayMonth ?? asMonthDay;
  }

  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function buildLocalDate(
  day: number,
  month: number,
  year: number,
  hour: number,
  minute: number,
  second: number,
): Date | null {
  if (
    !Number.isFinite(day) ||
    !Number.isFinite(month) ||
    !Number.isFinite(year) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day, hour, minute, second);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Prefer Google Sheet column A (`custom_fields.sheet_date`), else CRM `createdAt`. */
export function getDriverReceivedAt(lead: DriverLead, options?: { now?: Date }): Date {
  const sheetDate = lead.customFields?.sheet_date;
  if (typeof sheetDate === "string") {
    const parsed = parseDriverReceivedRaw(sheetDate, options);
    if (parsed) return parsed;
  }
  const created = new Date(lead.createdAt);
  return Number.isNaN(created.getTime()) ? new Date(0) : created;
}

export function getDriverReceivedAtIso(lead: DriverLead, options?: { now?: Date }): string {
  return getDriverReceivedAt(lead, options).toISOString();
}

/** Local calendar day `YYYY-MM-DD` for date filters. */
export function getDriverReceivedDayKey(lead: DriverLead, options?: { now?: Date }): string {
  const d = getDriverReceivedAt(lead, options);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
