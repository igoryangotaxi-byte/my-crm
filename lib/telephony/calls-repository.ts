import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import { israelPhoneKey } from "@/lib/call-center/phone";
import type { TelephonyCallDirection, TelephonyCallStatus, TelephonyCrmEntityType } from "@/lib/telephony/types";

export type TelephonyCallRow = {
  id: string;
  provider: string;
  providerCallId: string | null;
  channelId: string | null;
  direction: TelephonyCallDirection | null;
  fromNumber: string | null;
  toNumber: string | null;
  phoneKey: string | null;
  status: TelephonyCallStatus;
  startedAt: string | null;
  answeredAt: string | null;
  endedAt: string | null;
  durationSec: number | null;
  agentAppliUserId: string | null;
  agentExtension: string | null;
  recordingRef: string | null;
  crmEntityType: TelephonyCrmEntityType | null;
  crmEntityId: string | null;
  tripId: string | null;
  ticketId: string | null;
  transcription: string | null;
  summary: string | null;
  raw: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

function mapCall(row: Record<string, unknown>): TelephonyCallRow {
  return {
    id: String(row.id ?? ""),
    provider: typeof row.provider === "string" ? row.provider : "astradial",
    providerCallId: typeof row.provider_call_id === "string" ? row.provider_call_id : null,
    channelId: typeof row.channel_id === "string" ? row.channel_id : null,
    direction: (typeof row.direction === "string" ? row.direction : null) as TelephonyCallDirection | null,
    fromNumber: typeof row.from_number === "string" ? row.from_number : null,
    toNumber: typeof row.to_number === "string" ? row.to_number : null,
    phoneKey: typeof row.phone_key === "string" ? row.phone_key : null,
    status: (typeof row.status === "string" ? row.status : "unknown") as TelephonyCallStatus,
    startedAt: typeof row.started_at === "string" ? row.started_at : null,
    answeredAt: typeof row.answered_at === "string" ? row.answered_at : null,
    endedAt: typeof row.ended_at === "string" ? row.ended_at : null,
    durationSec: typeof row.duration_sec === "number" ? row.duration_sec : null,
    agentAppliUserId: typeof row.agent_appli_user_id === "string" ? row.agent_appli_user_id : null,
    agentExtension: typeof row.agent_extension === "string" ? row.agent_extension : null,
    recordingRef: typeof row.recording_ref === "string" ? row.recording_ref : null,
    crmEntityType: (typeof row.crm_entity_type === "string" ? row.crm_entity_type : null) as TelephonyCrmEntityType | null,
    crmEntityId: typeof row.crm_entity_id === "string" ? row.crm_entity_id : null,
    tripId: typeof row.trip_id === "string" ? row.trip_id : null,
    ticketId: typeof row.ticket_id === "string" ? row.ticket_id : null,
    transcription: typeof row.transcription === "string" ? row.transcription : null,
    summary: typeof row.summary === "string" ? row.summary : null,
    raw: row.raw && typeof row.raw === "object" && !Array.isArray(row.raw)
      ? (row.raw as Record<string, unknown>)
      : {},
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function getTelephonyCallById(id: string): Promise<TelephonyCallRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("telephony_calls").select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapCall(data as Record<string, unknown>);
}

export async function findTelephonyCallByProviderId(
  provider: string,
  providerCallId: string,
): Promise<TelephonyCallRow | null> {
  if (!isSupabaseConfigured() || !providerCallId) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telephony_calls")
    .select("*")
    .eq("provider", provider)
    .eq("provider_call_id", providerCallId)
    .maybeSingle();
  if (error || !data) return null;
  return mapCall(data as Record<string, unknown>);
}

export async function findTelephonyCallByChannelId(
  channelId: string,
): Promise<TelephonyCallRow | null> {
  if (!isSupabaseConfigured() || !channelId) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telephony_calls")
    .select("*")
    .eq("channel_id", channelId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return mapCall(data as Record<string, unknown>);
}

export type UpsertTelephonyCallInput = {
  provider?: string;
  providerCallId?: string | null;
  channelId?: string | null;
  direction?: string | null;
  fromNumber?: string | null;
  toNumber?: string | null;
  status?: string;
  startedAt?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  durationSec?: number | null;
  agentAppliUserId?: string | null;
  agentExtension?: string | null;
  recordingRef?: string | null;
  crmEntityType?: string | null;
  crmEntityId?: string | null;
  tripId?: string | null;
  ticketId?: string | null;
  raw?: Record<string, unknown>;
};

export async function upsertTelephonyCall(input: UpsertTelephonyCallInput): Promise<TelephonyCallRow> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const provider = input.provider ?? "astradial";
  const phoneForKey = input.direction === "outbound" ? input.toNumber : input.fromNumber;
  const phoneKey = israelPhoneKey(phoneForKey ?? input.fromNumber ?? input.toNumber ?? "");
  const now = new Date().toISOString();

  let existing: TelephonyCallRow | null = null;
  if (input.providerCallId) {
    existing = await findTelephonyCallByProviderId(provider, input.providerCallId);
  } else if (input.channelId) {
    existing = await findTelephonyCallByChannelId(input.channelId);
  }

  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = {
    provider,
    provider_call_id: input.providerCallId ?? existing?.providerCallId ?? null,
    channel_id: input.channelId ?? existing?.channelId ?? null,
    direction: input.direction ?? existing?.direction ?? null,
    from_number: input.fromNumber ?? existing?.fromNumber ?? null,
    to_number: input.toNumber ?? existing?.toNumber ?? null,
    phone_key: phoneKey || existing?.phoneKey || null,
    status: input.status ?? existing?.status ?? "unknown",
    started_at: input.startedAt ?? existing?.startedAt ?? now,
    answered_at: input.answeredAt ?? existing?.answeredAt ?? null,
    ended_at: input.endedAt ?? existing?.endedAt ?? null,
    duration_sec: input.durationSec ?? existing?.durationSec ?? null,
    agent_appli_user_id: input.agentAppliUserId ?? existing?.agentAppliUserId ?? null,
    agent_extension: input.agentExtension ?? existing?.agentExtension ?? null,
    recording_ref: input.recordingRef ?? existing?.recordingRef ?? null,
    crm_entity_type: input.crmEntityType ?? existing?.crmEntityType ?? null,
    crm_entity_id: input.crmEntityId ?? existing?.crmEntityId ?? null,
    trip_id: input.tripId ?? existing?.tripId ?? null,
    ticket_id: input.ticketId ?? existing?.ticketId ?? null,
    raw: { ...(existing?.raw ?? {}), ...(input.raw ?? {}) },
    updated_at: now,
  };

  if (existing) {
    const { data, error } = await supabase
      .from("telephony_calls")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message || "Failed to update telephony call.");
    return mapCall(data as Record<string, unknown>);
  }

  payload.created_at = now;
  const { data, error } = await supabase.from("telephony_calls").insert(payload).select("*").single();
  if (error || !data) throw new Error(error?.message || "Failed to insert telephony call.");
  return mapCall(data as Record<string, unknown>);
}

export async function insertTelephonyCallEvent(params: {
  callId?: string | null;
  provider?: string;
  providerEventId: string;
  eventType: string;
  eventAt?: string;
  payload?: Record<string, unknown>;
}): Promise<{ inserted: boolean; id?: string }> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telephony_call_events")
    .upsert(
      {
        call_id: params.callId ?? null,
        provider: params.provider ?? "astradial",
        provider_event_id: params.providerEventId,
        event_type: params.eventType,
        event_at: params.eventAt ?? new Date().toISOString(),
        payload: params.payload ?? {},
      },
      { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    // Unique violation = already processed
    if (error.code === "23505") return { inserted: false };
    throw new Error(error.message);
  }
  return { inserted: Boolean(data?.id), id: data?.id ? String(data.id) : undefined };
}

export async function updateTelephonyCallAi(
  id: string,
  input: { transcription?: string | null; summary?: string | null },
): Promise<TelephonyCallRow> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.transcription !== undefined) payload.transcription = input.transcription;
  if (input.summary !== undefined) payload.summary = input.summary;
  const { data, error } = await supabase
    .from("telephony_calls")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to update call AI fields.");
  return mapCall(data as Record<string, unknown>);
}

export async function listTelephonyCalls(params: {
  phoneKey?: string;
  crmEntityType?: string;
  crmEntityId?: string;
  agentAppliUserId?: string;
  limit?: number;
}): Promise<TelephonyCallRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("telephony_calls")
    .select("*")
    .order("started_at", { ascending: false, nullsFirst: false })
    .limit(Math.min(Math.max(params.limit ?? 50, 1), 200));

  if (params.phoneKey) query = query.eq("phone_key", params.phoneKey);
  if (params.crmEntityType && params.crmEntityId) {
    query = query.eq("crm_entity_type", params.crmEntityType).eq("crm_entity_id", params.crmEntityId);
  }
  if (params.agentAppliUserId) query = query.eq("agent_appli_user_id", params.agentAppliUserId);

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(mapCall);
}
