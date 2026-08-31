import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export const CALL_CENTER_OPERATOR_STATUSES = [
  "available",
  "away",
  "dnd",
  "offline",
] as const;

export type CallCenterOperatorStatus = (typeof CALL_CENTER_OPERATOR_STATUSES)[number];

export type CallCenterUserSettings = {
  userId: string;
  extension: string;
  preferredDeviceId: string | null;
  operatorStatus: CallCenterOperatorStatus;
  notificationsMuted: boolean;
  threeCxUserId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export function isCallCenterOperatorStatus(value: unknown): value is CallCenterOperatorStatus {
  return (
    typeof value === "string" &&
    (CALL_CENTER_OPERATOR_STATUSES as readonly string[]).includes(value)
  );
}

function mapRow(row: Record<string, unknown>): CallCenterUserSettings {
  const statusRaw = typeof row.operator_status === "string" ? row.operator_status : "available";
  return {
    userId: String(row.user_id ?? ""),
    extension: String(row.extension ?? "").trim(),
    preferredDeviceId:
      typeof row.preferred_device_id === "string" && row.preferred_device_id.trim()
        ? row.preferred_device_id.trim()
        : null,
    operatorStatus: isCallCenterOperatorStatus(statusRaw) ? statusRaw : "available",
    notificationsMuted: Boolean(row.notifications_muted),
    threeCxUserId:
      typeof row.threecx_user_id === "string" && row.threecx_user_id.trim()
        ? row.threecx_user_id.trim()
        : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function getCallCenterUserSettings(
  userId: string,
): Promise<CallCenterUserSettings | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("call_center_user_settings")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as Record<string, unknown>);
}

export async function upsertCallCenterUserSettings(params: {
  userId: string;
  extension: string;
  preferredDeviceId?: string | null;
  operatorStatus?: CallCenterOperatorStatus;
  notificationsMuted?: boolean;
  threeCxUserId?: string | null;
}): Promise<CallCenterUserSettings> {
  const extension = params.extension.trim();
  if (!extension) throw new Error("Extension is required.");
  if (!isSupabaseConfigured()) {
    throw new Error("Supabase is not configured.");
  }
  const current = await getCallCenterUserSettings(params.userId);
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const payload = {
    user_id: params.userId,
    extension,
    preferred_device_id:
      params.preferredDeviceId !== undefined
        ? params.preferredDeviceId?.trim() || null
        : current?.preferredDeviceId ?? null,
    operator_status: params.operatorStatus ?? current?.operatorStatus ?? "available",
    notifications_muted:
      params.notificationsMuted !== undefined
        ? params.notificationsMuted
        : (current?.notificationsMuted ?? false),
    threecx_user_id:
      params.threeCxUserId !== undefined
        ? params.threeCxUserId?.trim() || null
        : current?.threeCxUserId ?? null,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("call_center_user_settings")
    .upsert(payload, { onConflict: "user_id" })
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (data) return mapRow(data as Record<string, unknown>);
  return mapRow(payload);
}

export async function patchCallCenterUserSettings(
  userId: string,
  patch: {
    operatorStatus?: CallCenterOperatorStatus;
    notificationsMuted?: boolean;
    threeCxUserId?: string | null;
    preferredDeviceId?: string | null;
  },
): Promise<CallCenterUserSettings> {
  const current = await getCallCenterUserSettings(userId);
  if (!current) throw new Error("Link your 3CX extension first.");
  return upsertCallCenterUserSettings({
    userId,
    extension: current.extension,
    preferredDeviceId:
      patch.preferredDeviceId !== undefined ? patch.preferredDeviceId : current.preferredDeviceId,
    operatorStatus: patch.operatorStatus ?? current.operatorStatus,
    notificationsMuted:
      patch.notificationsMuted !== undefined
        ? patch.notificationsMuted
        : current.notificationsMuted,
    threeCxUserId: patch.threeCxUserId !== undefined ? patch.threeCxUserId : current.threeCxUserId,
  });
}

export async function deleteCallCenterUserSettings(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("call_center_user_settings").delete().eq("user_id", userId);
  if (error) throw new Error(error.message);
}
