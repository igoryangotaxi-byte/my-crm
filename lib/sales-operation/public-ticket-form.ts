import type { TrackerPriority, TrackerStatus } from "@/lib/sales-operation/tracker-types";
import { TRACKER_PRIORITIES } from "@/lib/sales-operation/tracker-types";

/** Default Tracker board for external (unauthenticated) submissions. */
export const DEFAULT_PUBLIC_TRACKER_PROJECT_ID =
  "2cc7d354-1f6f-42d5-bb37-1efd6768f689";

export const DEFAULT_PUBLIC_TRACKER_STATUS_NAME = "To Do";

export const PUBLIC_TICKET_ACTOR = {
  userId: null as string | null,
  name: "External form",
};

export const MAX_PUBLIC_TICKET_FILES = 5;
export const MAX_PUBLIC_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_PUBLIC_TITLE_CHARS = 200;
export const MAX_PUBLIC_DESCRIPTION_CHARS = 8000;

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_PER_WINDOW = 5;

type RateBucket = { timestamps: number[] };
const rateBuckets = new Map<string, RateBucket>();

export function getPublicTrackerProjectId(): string {
  const fromEnv = process.env.PUBLIC_TRACKER_PROJECT_ID?.trim();
  return fromEnv || DEFAULT_PUBLIC_TRACKER_PROJECT_ID;
}

export function getPublicTrackerStatusName(): string {
  const fromEnv = process.env.PUBLIC_TRACKER_STATUS_NAME?.trim();
  return fromEnv || DEFAULT_PUBLIC_TRACKER_STATUS_NAME;
}

export function normalizePublicPriority(value: unknown): TrackerPriority {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  return (TRACKER_PRIORITIES as readonly string[]).includes(raw)
    ? (raw as TrackerPriority)
    : "normal";
}

export function findPublicTargetStatus(
  statuses: TrackerStatus[],
  preferredName: string = getPublicTrackerStatusName(),
): TrackerStatus | null {
  const needle = preferredName.trim().toLowerCase();
  const exact = statuses.find((s) => s.name.trim().toLowerCase() === needle);
  if (exact) return exact;
  return null;
}

export function validatePublicTicketFields(input: {
  title: unknown;
  description: unknown;
}): { ok: true; title: string; description: string } | { ok: false; error: string } {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const description = typeof input.description === "string" ? input.description.trim() : "";

  if (!title) return { ok: false, error: "Title is required." };
  if (title.length > MAX_PUBLIC_TITLE_CHARS) {
    return { ok: false, error: `Title is too long (max ${MAX_PUBLIC_TITLE_CHARS} characters).` };
  }
  if (!description) return { ok: false, error: "Description is required." };
  if (description.length > MAX_PUBLIC_DESCRIPTION_CHARS) {
    return {
      ok: false,
      error: `Description is too long (max ${MAX_PUBLIC_DESCRIPTION_CHARS} characters).`,
    };
  }
  return { ok: true, title, description };
}

export function getRequestClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

/** Returns true when the client is within the allowed submission rate. */
export function consumePublicTicketRateLimit(ip: string, now = Date.now()): boolean {
  const key = ip || "unknown";
  const bucket = rateBuckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < RATE_WINDOW_MS);
  if (bucket.timestamps.length >= RATE_MAX_PER_WINDOW) {
    rateBuckets.set(key, bucket);
    return false;
  }
  bucket.timestamps.push(now);
  rateBuckets.set(key, bucket);
  return true;
}

/** Test helper — clears in-memory rate buckets. */
export function resetPublicTicketRateLimitForTests(): void {
  rateBuckets.clear();
}

export function buildPublicTicketDescription(description: string): string {
  return `${description.trim()}\n\n—\nSubmitted via public form.`;
}
