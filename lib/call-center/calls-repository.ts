import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { normalizePhone } from "@/lib/sales-operation/dedup";

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

function parseCallAt(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const raw = value.trim();
  const iso = new Date(raw);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  // Bar Oz sample: "21.7.2020 10:15" (d.M.yyyy H:mm)
  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m) {
    const [, d, mo, y, h, mi] = m;
    const dt = new Date(
      Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), 0),
    );
    if (!Number.isNaN(dt.getTime())) return dt.toISOString();
  }
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

  const supabase = getSupabaseAdminClient();
  const payload = {
    phone,
    phone_key: normalizePhone(phone) || null,
    queue: input.queue?.trim() || null,
    direction: input.direction?.trim() || null,
    call_type: input.callType?.trim() || null,
    contact_name: input.contactName?.trim() || null,
    agent_extension: agentExtension,
    agent_name: input.agentName?.trim() || null,
    crm_user_id: crmUserId,
    duration_sec: parseDuration(input.durationSec ?? null),
    call_at: parseCallAt(input.callAt ?? null),
    description: input.description?.trim() || null,
    recording_url: input.recordingUrl?.trim() || null,
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
