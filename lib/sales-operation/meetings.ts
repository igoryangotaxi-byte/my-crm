import { getSupabaseAdminClient } from "@/lib/supabase";

export type SalesMeeting = {
  id: string;
  userId: string;
  clientId: string | null;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  googleEventId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateMeetingInput = {
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  clientId?: string | null;
  googleEventId?: string | null;
};

export type UpdateMeetingInput = Partial<CreateMeetingInput>;

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapMeetingRow(row: Record<string, unknown>): SalesMeeting {
  return {
    id: String(row.id),
    userId: String(row.user_id ?? ""),
    clientId: typeof row.client_id === "string" ? row.client_id : null,
    title: String(row.title ?? ""),
    description: readText(row.description),
    startsAt: String(row.starts_at ?? ""),
    endsAt: String(row.ends_at ?? ""),
    googleEventId: readText(row.google_event_id),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function listMeetingsForUser(
  userId: string,
  range?: { from?: string; to?: string },
): Promise<SalesMeeting[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("sales_meetings").select("*").eq("user_id", userId);
  if (range?.from) query = query.gte("starts_at", range.from);
  if (range?.to) query = query.lte("starts_at", range.to);
  query = query.order("starts_at", { ascending: true });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMeetingRow(row as Record<string, unknown>));
}

export async function listMeetingsForClient(clientId: string): Promise<SalesMeeting[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_meetings")
    .select("*")
    .eq("client_id", clientId)
    .order("starts_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapMeetingRow(row as Record<string, unknown>));
}

export async function getMeetingById(id: string): Promise<SalesMeeting | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("sales_meetings").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapMeetingRow(data as Record<string, unknown>) : null;
}

export async function createMeeting(
  userId: string,
  input: CreateMeetingInput,
): Promise<SalesMeeting> {
  const title = input.title?.trim();
  if (!title) throw new Error("Meeting title is required.");
  if (!input.startsAt || !input.endsAt) throw new Error("Meeting start and end are required.");
  if (new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) {
    throw new Error("Meeting end must be after start.");
  }

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_meetings")
    .insert({
      user_id: userId,
      client_id: input.clientId?.trim() || null,
      title,
      description: input.description?.trim() || null,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      google_event_id: input.googleEventId?.trim() || null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create meeting.");
  return mapMeetingRow(data as Record<string, unknown>);
}

export async function updateMeeting(
  userId: string,
  id: string,
  input: UpdateMeetingInput,
): Promise<SalesMeeting> {
  const existing = await getMeetingById(id);
  if (!existing || existing.userId !== userId) throw new Error("Meeting not found.");

  const startsAt = input.startsAt ?? existing.startsAt;
  const endsAt = input.endsAt ?? existing.endsAt;
  if (new Date(endsAt).getTime() <= new Date(startsAt).getTime()) {
    throw new Error("Meeting end must be after start.");
  }

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new Error("Meeting title is required.");
    payload.title = title;
  }
  if (input.description !== undefined) payload.description = input.description?.trim() || null;
  if (input.startsAt !== undefined) payload.starts_at = input.startsAt;
  if (input.endsAt !== undefined) payload.ends_at = input.endsAt;
  if (input.clientId !== undefined) payload.client_id = input.clientId?.trim() || null;
  if (input.googleEventId !== undefined) payload.google_event_id = input.googleEventId?.trim() || null;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_meetings")
    .update(payload)
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update meeting.");
  return mapMeetingRow(data as Record<string, unknown>);
}

export async function deleteMeeting(userId: string, id: string): Promise<SalesMeeting> {
  const existing = await getMeetingById(id);
  if (!existing || existing.userId !== userId) throw new Error("Meeting not found.");
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_meetings").delete().eq("id", id).eq("user_id", userId);
  if (error) throw new Error(error.message);
  return existing;
}
