import type { WeekdayKey } from "@/lib/price-calculator-formulas";

export type TranscriptMotPricingModel =
  | { type: "linear"; base: number; perKm: number }
  | { type: "tiered_km"; base: number; firstKm: number; rateFirst: number; rateAfter: number };

export type TranscriptMotSegment = {
  /** When true, window crosses midnight: matches if minuteOfDay >= from OR minuteOfDay <= to */
  wrap: boolean;
  fromHour: number;
  fromMinute: number;
  toHour: number;
  toMinute: number;
  model: TranscriptMotPricingModel;
};

export type TranscriptMotRules = {
  version: 1;
  segments: TranscriptMotSegment[];
};

function toMinuteOfDay(hour: number, minute: number): number {
  return hour * 60 + minute;
}

/** Minute of day 0–1439 in Asia/Jerusalem for the given instant. */
export function getJerusalemMinuteOfDay(tripAt: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(tripAt);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Weekday key in Asia/Jerusalem (Sunday = 0 … Saturday = 6) mapped to WeekdayKey. */
export function getJerusalemWeekdayKey(tripAt: Date): WeekdayKey {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(tripAt);
  const map: Record<string, WeekdayKey> = {
    Sun: "sunday",
    Mon: "monday",
    Tue: "tuesday",
    Wed: "wednesday",
    Thu: "thursday",
    Fri: "friday",
    Sat: "saturday",
  };
  return map[weekday] ?? "monday";
}

/** Yango driver tariff inputs in Asia/Jerusalem local time for the trip instant. */
export function getJerusalemYangoTimeInputs(tripAt: Date): { weekday: WeekdayKey; timeMinutes: number } {
  return { weekday: getJerusalemWeekdayKey(tripAt), timeMinutes: getJerusalemMinuteOfDay(tripAt) };
}

function segmentMatches(segment: TranscriptMotSegment, minuteOfDay: number): boolean {
  const from = toMinuteOfDay(segment.fromHour, segment.fromMinute);
  const to = toMinuteOfDay(segment.toHour, segment.toMinute);
  if (segment.wrap) {
    return minuteOfDay >= from || minuteOfDay <= to;
  }
  return minuteOfDay >= from && minuteOfDay <= to;
}

function evaluateModel(model: TranscriptMotPricingModel, km: number): number {
  if (model.type === "linear") {
    return model.base + km * model.perKm;
  }
  const first = Math.min(km, model.firstKm);
  const after = Math.max(0, km - model.firstKm);
  return model.base + first * model.rateFirst + after * model.rateAfter;
}

export function evaluateTranscriptMotClientPrice(rules: TranscriptMotRules, km: number, tripAt: Date): number {
  const minuteOfDay = getJerusalemMinuteOfDay(tripAt);
  for (const segment of rules.segments) {
    if (segmentMatches(segment, minuteOfDay)) {
      return evaluateModel(segment.model, km);
    }
  }
  throw new Error("No tariff segment matches trip time in Asia/Jerusalem.");
}

/** Index of the first segment that matches trip local time (Asia/Jerusalem), or -1 if none. */
export function findMatchingSegmentIndex(rules: TranscriptMotRules, tripAt: Date): number {
  const minuteOfDay = getJerusalemMinuteOfDay(tripAt);
  for (let i = 0; i < rules.segments.length; i++) {
    if (segmentMatches(rules.segments[i]!, minuteOfDay)) return i;
  }
  return -1;
}

function isFiniteNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

function parseModel(raw: unknown): TranscriptMotPricingModel | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.type === "linear" && isFiniteNumber(o.base) && isFiniteNumber(o.perKm)) {
    return { type: "linear", base: o.base, perKm: o.perKm };
  }
  if (
    o.type === "tiered_km" &&
    isFiniteNumber(o.base) &&
    isFiniteNumber(o.firstKm) &&
    isFiniteNumber(o.rateFirst) &&
    isFiniteNumber(o.rateAfter)
  ) {
    return {
      type: "tiered_km",
      base: o.base,
      firstKm: o.firstKm,
      rateFirst: o.rateFirst,
      rateAfter: o.rateAfter,
    };
  }
  return null;
}

function parseSegment(raw: unknown): TranscriptMotSegment | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const wrap = o.wrap === true;
  const fromHour = Number(o.fromHour);
  const fromMinute = Number(o.fromMinute);
  const toHour = Number(o.toHour);
  const toMinute = Number(o.toMinute);
  if (![fromHour, fromMinute, toHour, toMinute].every((n) => Number.isFinite(n))) return null;
  const model = parseModel(o.model);
  if (!model) return null;
  return {
    wrap,
    fromHour,
    fromMinute,
    toHour,
    toMinute,
    model,
  };
}

export function parseTranscriptMotRules(raw: unknown): TranscriptMotRules | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  if (!Array.isArray(o.segments)) return null;
  const segments: TranscriptMotSegment[] = [];
  for (const item of o.segments) {
    const seg = parseSegment(item);
    if (!seg) return null;
    segments.push(seg);
  }
  if (segments.length === 0) return null;
  return { version: 1, segments };
}
