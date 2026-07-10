import type {
  B2BClientRegistryEntry,
  ManagerAssignment,
  UpdateB2BClientManagersInput,
} from "@/lib/sales-operation/manager-types";
import { getSupabaseAdminClient } from "@/lib/supabase";

export function normalizeCorpClientId(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function mapManagerRow(row: Record<string, unknown>, prefix: "account" | "sales"): ManagerAssignment {
  const userKey = prefix === "account" ? "account_manager_user_id" : "sales_manager_user_id";
  const nameKey = prefix === "account" ? "account_manager_name" : "sales_manager_name";
  return {
    userId: typeof row[userKey] === "string" ? row[userKey] : null,
    name: typeof row[nameKey] === "string" ? row[nameKey] : null,
  };
}

function mapRegistryRow(row: Record<string, unknown>): B2BClientRegistryEntry {
  const corpClientId = normalizeCorpClientId(String(row.corp_client_id ?? ""));
  return {
    corpClientId,
    clientName: String(row.client_name ?? corpClientId),
    accountManager: mapManagerRow(row, "account"),
    salesManager: mapManagerRow(row, "sales"),
  };
}

export async function listB2BClientRegistry(): Promise<B2BClientRegistryEntry[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .order("client_name", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((row) => mapRegistryRow(row as Record<string, unknown>))
    .filter((row) => row.corpClientId.length > 0);
}

export async function getB2BClientRegistryEntry(
  corpClientId: string,
): Promise<B2BClientRegistryEntry | null> {
  const normalized = normalizeCorpClientId(corpClientId);
  if (!normalized) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .eq("corp_client_id", normalized)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapRegistryRow(data as Record<string, unknown>) : null;
}

export async function getManagersByCorpClientIds(
  corpClientIds: string[],
): Promise<Map<string, B2BClientRegistryEntry>> {
  const ids = [...new Set(corpClientIds.map(normalizeCorpClientId).filter(Boolean))];
  const map = new Map<string, B2BClientRegistryEntry>();
  if (ids.length === 0) return map;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .in("corp_client_id", ids);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const entry = mapRegistryRow(row as Record<string, unknown>);
    if (entry.corpClientId) map.set(entry.corpClientId, entry);
  }
  return map;
}

export async function updateB2BClientManagers(
  corpClientId: string,
  input: UpdateB2BClientManagersInput,
): Promise<B2BClientRegistryEntry> {
  const normalized = normalizeCorpClientId(corpClientId);
  if (!normalized) throw new Error("corpClientId is required.");

  const existing = await getB2BClientRegistryEntry(normalized);
  if (!existing) throw new Error("B2B client not found in registry.");

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.accountManagerUserId !== undefined) {
    payload.account_manager_user_id = input.accountManagerUserId;
  }
  if (input.accountManagerName !== undefined) {
    payload.account_manager_name = input.accountManagerName;
  }
  if (input.salesManagerUserId !== undefined) {
    payload.sales_manager_user_id = input.salesManagerUserId;
  }
  if (input.salesManagerName !== undefined) {
    payload.sales_manager_name = input.salesManagerName;
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .update(payload)
    .eq("corp_client_id", normalized)
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update B2B client managers.");
  return mapRegistryRow(data as Record<string, unknown>);
}

export async function applyPendingSalesManagerToCorpClient(
  corpClientId: string,
  pending: ManagerAssignment,
): Promise<void> {
  if (!pending.userId) return;
  const entry = await getB2BClientRegistryEntry(corpClientId);
  if (!entry || entry.salesManager.userId) return;
  await updateB2BClientManagers(corpClientId, {
    salesManagerUserId: pending.userId,
    salesManagerName: pending.name,
  });
}
