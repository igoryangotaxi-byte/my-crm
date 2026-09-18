import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { israelPhoneKey } from "@/lib/call-center/phone";
import { jerusalemWallToUtcMs } from "@/lib/jerusalem-wall-time";

export type CallCenterCallRecord = {
  id: string;
  phone: string;
  phoneKey: string | null;
  queue: string | null;
  direction: string | null;
  callType: string | null;
  contactName: string | null;
  agentExtension: string | null;
  agentName: string | null;
  crmUserId: string | null;
  durationSec: number | null;
  callAt: string | null;
  description: string | null;
  recordingUrl: string | null;
  summary: string | null;
  transcription: string | null;
  createdAt: string;
};

function mapCallRow(row: Record<string, unknown>): CallCenterCallRecord {
  return {
    id: String(row.id),
    phone: String(row.phone ?? ""),
    phoneKey: typeof row.phone_key === "string" ? row.phone_key : null,
    queue: typeof row.queue === "string" ? row.queue : null,
    direction: typeof row.direction === "string" ? row.direction : null,
    callType: typeof row.call_type === "string" ? row.call_type : null,
    contactName: typeof row.contact_name === "string" ? row.contact_name : null,
    agentExtension: typeof row.agent_extension === "string" ? row.agent_extension : null,
    agentName: typeof row.agent_name === "string" ? row.agent_name : null,
    crmUserId: typeof row.crm_user_id === "string" ? row.crm_user_id : null,
    durationSec:
      typeof row.duration_sec === "number" && Number.isFinite(row.duration_sec)
        ? row.duration_sec
        : null,
    callAt: typeof row.call_at === "string" ? row.call_at : null,
    description: typeof row.description === "string" ? row.description : null,
    recordingUrl: typeof row.recording_url === "string" ? row.recording_url : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    transcription: typeof row.transcription === "string" ? row.transcription : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function parseDuration(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Math.max(0, Math.round(Number(value)));
  }
  return null;
}

function jerusalemIso(y: number, mo: number, d: number, h: number, mi: number, s = 0): string | null {
  const ms = jerusalemWallToUtcMs({ y, mo, d, h, mi, s });
  const dt = new Date(ms);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

/** Exported for tests. ISO with Z/offset kept; naive / Bar Oz dotted times are Asia/Jerusalem. */
export function parseCallAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();

  if (/Z$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const iso = new Date(raw);
    if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  }

  const isoLocal = raw.match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  if (isoLocal) {
    return jerusalemIso(
      Number(isoLocal[1]),
      Number(isoLocal[2]),
      Number(isoLocal[3]),
      Number(isoLocal[4]),
      Number(isoLocal[5]),
      isoLocal[6] ? Number(isoLocal[6]) : 0,
    );
  }

  // Bar Oz sample: "21.7.2020 10:15" (d.M.yyyy H:mm) — local Israel wall clock.
  const dotted = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dotted) {
    return jerusalemIso(
      Number(dotted[3]),
      Number(dotted[2]),
      Number(dotted[1]),
      Number(dotted[4]),
      Number(dotted[5]),
      dotted[6] ? Number(dotted[6]) : 0,
    );
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString();
  return null;
}

export async function findCrmUserIdByExtension(extension: string): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const ext = extension.trim();
  if (!ext) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("call_center_user_settings")
    .select("user_id")
    .eq("extension", ext)
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.user_id === "string" ? data.user_id : null;
}

export type InsertCallCenterCallInput = {
  phone: string;
  queue?: string | null;
  direction?: string | null;
  callType?: string | null;
  contactName?: string | null;
  agentExtension?: string | null;
  agentName?: string | null;
  durationSec?: number | string | null;
  callAt?: string | null;
  description?: string | null;
  recordingUrl?: string | null;
  summary?: string | null;
  transcription?: string | null;
  raw?: Record<string, unknown>;
};

export async function insertCallCenterCall(
  input: InsertCallCenterCallInput,
): Promise<CallCenterCallRecord> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const phone = input.phone.trim();
  if (!phone) throw new Error("Phone is required.");

  const agentExtension = input.agentExtension?.trim() || null;
  const crmUserId = agentExtension ? await findCrmUserIdByExtension(agentExtension) : null;
  const phoneKey = israelPhoneKey(phone) || null;
  const durationSec = parseDuration(input.durationSec ?? null);
  const callAt = parseCallAt(input.callAt ?? null);
  const recordingUrl = input.recordingUrl?.trim() || null;

  const supabase = getSupabaseAdminClient();

  if (phoneKey && agentExtension && callAt) {
    let existingQuery = supabase
      .from("call_center_calls")
      .select("*")
      .eq("phone_key", phoneKey)
      .eq("agent_extension", agentExtension)
      .eq("call_at", callAt)
      .limit(1);
    existingQuery =
      durationSec == null
        ? existingQuery.is("duration_sec", null)
        : existingQuery.eq("duration_sec", durationSec);
    const { data: existingRows } = await existingQuery;
    const existing = existingRows?.[0] as Record<string, unknown> | undefined;
    if (existing) {
      if (recordingUrl && !existing.recording_url) {
        const { data: updated, error: updateError } = await supabase
          .from("call_center_calls")
          .update({
            recording_url: recordingUrl,
            summary: input.summary?.trim() || existing.summary || null,
            transcription: input.transcription?.trim() || existing.transcription || null,
            raw: input.raw ?? existing.raw ?? {},
          })
          .eq("id", String(existing.id))
          .select("*")
          .maybeSingle();
        if (!updateError && updated) return mapCallRow(updated as Record<string, unknown>);
      }
      return mapCallRow(existing);
    }
  }

  const payload = {
    phone,
    phone_key: phoneKey,
    queue: input.queue?.trim() || null,
    direction: input.direction?.trim() || null,
    call_type: input.callType?.trim() || null,
    contact_name: input.contactName?.trim() || null,
    agent_extension: agentExtension,
    agent_name: input.agentName?.trim() || null,
    crm_user_id: crmUserId,
    duration_sec: durationSec,
    call_at: callAt,
    description: input.description?.trim() || null,
    recording_url: recordingUrl,
    summary: input.summary?.trim() || null,
    transcription: input.transcription?.trim() || null,
    raw: input.raw ?? {},
  };

  const { data, error } = await supabase
    .from("call_center_calls")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to insert call report.");
  return mapCallRow(data as Record<string, unknown>);
}

export async function listCallCenterCalls(params: {
  crmUserId?: string | null;
  agentExtension?: string | null;
  /** When true with crmUserId/extension, return all rows (Admin). */
  all?: boolean;
  limit?: number;
}): Promise<CallCenterCallRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdminClient();
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  let query = supabase
    .from("call_center_calls")
    .select("*")
    .order("call_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(params.all ? limit : Math.min(limit * 3, 200));

  if (params.all) {
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => mapCallRow(row as Record<string, unknown>));
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data ?? []).map((row) => mapCallRow(row as Record<string, unknown>));
  const userId = params.crmUserId?.trim() || null;
  const ext = params.agentExtension?.trim() || null;
  if (!userId && !ext) return rows.slice(0, limit);
  return rows
    .filter(
      (c) =>
        (userId && c.crmUserId === userId) || (ext && c.agentExtension === ext),
    )
    .slice(0, limit);
}
