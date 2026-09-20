import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";
import type { TelephonyAgentStatus } from "@/lib/telephony/types";

export const TELEPHONY_AGENT_STATUSES = ["available", "busy", "break", "offline"] as const;

export type TelephonyAgentRow = {
  appliUserId: string;
  provider: string;
  providerUserId: string | null;
  extension: string;
  status: TelephonyAgentStatus;
  createdAt: string | null;
  updatedAt: string | null;
};

export function isTelephonyAgentStatus(value: unknown): value is TelephonyAgentStatus {
  return (
    typeof value === "string" &&
    (TELEPHONY_AGENT_STATUSES as readonly string[]).includes(value)
  );
}

function mapAgent(row: Record<string, unknown>): TelephonyAgentRow {
  const statusRaw = typeof row.status === "string" ? row.status : "offline";
  return {
    appliUserId: String(row.appli_user_id ?? ""),
    provider: typeof row.provider === "string" ? row.provider : "astradial",
    providerUserId:
      typeof row.provider_user_id === "string" && row.provider_user_id.trim()
        ? row.provider_user_id.trim()
        : null,
    extension: String(row.extension ?? "").trim(),
    status: isTelephonyAgentStatus(statusRaw) ? statusRaw : "offline",
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

export async function getTelephonyAgent(appliUserId: string): Promise<TelephonyAgentRow | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telephony_agents")
    .select("*")
    .eq("appli_user_id", appliUserId)
    .maybeSingle();
  if (error || !data) return null;
  return mapAgent(data as Record<string, unknown>);
}

export async function findTelephonyAgentByExtension(
  extension: string,
): Promise<TelephonyAgentRow | null> {
  if (!isSupabaseConfigured()) return null;
  const ext = extension.trim();
  if (!ext) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("telephony_agents")
    .select("*")
    .eq("extension", ext)
    .maybeSingle();
  if (error || !data) return null;
  return mapAgent(data as Record<string, unknown>);
}

export async function upsertTelephonyAgent(params: {
  appliUserId: string;
  extension: string;
  provider?: string;
  providerUserId?: string | null;
  status?: TelephonyAgentStatus;
}): Promise<TelephonyAgentRow> {
  const extension = params.extension.trim();
  if (!extension) throw new Error("Extension is required.");
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");

  const current = await getTelephonyAgent(params.appliUserId);
  const now = new Date().toISOString();
  const supabase = getSupabaseAdminClient();
  const payload = {
    appli_user_id: params.appliUserId,
    provider: params.provider ?? current?.provider ?? "astradial",
    provider_user_id:
      params.providerUserId !== undefined ? params.providerUserId : current?.providerUserId ?? null,
    extension,
    status: params.status ?? current?.status ?? "offline",
    created_at: current?.createdAt ?? now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("telephony_agents")
    .upsert(payload, { onConflict: "appli_user_id" })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message || "Failed to save telephony agent.");
  return mapAgent(data as Record<string, unknown>);
}

export async function deleteTelephonyAgent(appliUserId: string): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error("Supabase is not configured.");
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("telephony_agents").delete().eq("appli_user_id", appliUserId);
  if (error) throw new Error(error.message);
}
