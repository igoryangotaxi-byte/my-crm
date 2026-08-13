import type {
  B2BClientRegistryEntry,
  ManagerAssignment,
  UpdateB2BClientManagersInput,
} from "@/lib/sales-operation/manager-types";
import { corpClientIdsMatch, normalizeCorpClientId } from "@/lib/sales-operation/corp-client-id";
import { getSupabaseAdminClient } from "@/lib/supabase";

export { corpClientIdsMatch, normalizeCorpClientId } from "@/lib/sales-operation/corp-client-id";

function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
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
  const corpClientId = String(row.corp_client_id ?? "").trim();
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
  const raw = (corpClientId ?? "").trim();
  const normalized = normalizeCorpClientId(raw);
  if (!normalized) return null;
  const supabase = getSupabaseAdminClient();
  const selectColumns =
    "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name";

  for (const candidate of [...new Set([raw, normalized])]) {
    const { data, error } = await supabase
      .from("gp_corp_client_map")
      .select(selectColumns)
      .eq("corp_client_id", candidate)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return mapRegistryRow(data as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .select(selectColumns)
    .ilike("corp_client_id", escapeIlike(normalized))
    .limit(20);
  if (error) throw new Error(error.message);
  const match = (data ?? [])
    .map((row) => mapRegistryRow(row as Record<string, unknown>))
    .find((entry) => corpClientIdsMatch(entry.corpClientId, normalized));
  return match ?? null;
}

export async function findB2BClientRegistryByName(
  companyName: string,
): Promise<B2BClientRegistryEntry | null> {
  const needle = companyName.trim().toLowerCase();
  if (!needle) return null;
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .ilike("client_name", escapeIlike(companyName.trim()))
    .limit(20);
  if (error) throw new Error(error.message);
  const matches = (data ?? [])
    .map((row) => mapRegistryRow(row as Record<string, unknown>))
    .filter((entry) => entry.clientName.trim().toLowerCase() === needle);
  return matches.length === 1 ? matches[0] : null;
}

export async function resolveB2BOverviewClient(input: {
  corpClientId?: string | null;
  companyName?: string | null;
}): Promise<B2BClientRegistryEntry | null> {
  if (input.corpClientId?.trim()) {
    return getB2BClientRegistryEntry(input.corpClientId);
  }
  if (input.companyName?.trim()) {
    return findB2BClientRegistryByName(input.companyName);
  }
  return null;
}

export function hydrateLeadFromB2BOverview<
  T extends {
    corpClientId?: string | null;
    companyName?: string | null;
    assignedManagerUserId?: string | null;
    assignedManagerName?: string | null;
  },
>(input: T, entry: B2BClientRegistryEntry | null): T {
  if (!entry) {
    if (!input.corpClientId?.trim()) return input;
    return { ...input, corpClientId: normalizeCorpClientId(input.corpClientId) || null };
  }
  return {
    ...input,
    corpClientId: entry.corpClientId,
    companyName: input.companyName?.trim() || entry.clientName,
    assignedManagerUserId: input.assignedManagerUserId || entry.salesManager.userId || null,
    assignedManagerName: input.assignedManagerUserId
      ? input.assignedManagerName
      : entry.salesManager.name || input.assignedManagerName || null,
  };
}

export async function getManagersByCorpClientIds(
  corpClientIds: string[],
): Promise<Map<string, B2BClientRegistryEntry>> {
  const ids = [...new Set(corpClientIds.map(normalizeCorpClientId).filter(Boolean))];
  const map = new Map<string, B2BClientRegistryEntry>();
  if (ids.length === 0) return map;

  const supabase = getSupabaseAdminClient();
  const variants = [...new Set(corpClientIds.flatMap((id) => {
    const raw = id.trim();
    return raw ? [raw, raw.toLowerCase()] : [];
  }))];
  const { data, error } = await supabase
    .from("gp_corp_client_map")
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .in("corp_client_id", variants);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    const entry = mapRegistryRow(row as Record<string, unknown>);
    const key = normalizeCorpClientId(entry.corpClientId);
    if (key) map.set(key, entry);
  }

  const missing = ids.filter((id) => !map.has(id));
  for (let i = 0; i < missing.length; i += 15) {
    const chunk = missing.slice(i, i + 15);
    const { data: extra, error: extraError } = await supabase
      .from("gp_corp_client_map")
      .select(
        "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
      )
      .or(chunk.map((id) => `corp_client_id.ilike.${escapeIlike(id)}`).join(","));
    if (extraError) throw new Error(extraError.message);
    for (const row of extra ?? []) {
      const entry = mapRegistryRow(row as Record<string, unknown>);
      const key = normalizeCorpClientId(entry.corpClientId);
      if (key) map.set(key, entry);
    }
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
  const dbCorpClientId = existing.corpClientId;

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
    .eq("corp_client_id", dbCorpClientId)
    .select(
      "corp_client_id,client_name,account_manager_user_id,account_manager_name,sales_manager_user_id,sales_manager_name",
    )
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update B2B client managers.");
  return mapRegistryRow(data as Record<string, unknown>);
}

export type PendingSalesManagerApplyPlan =
  | { action: "skip" }
  | {
      action: "upsert" | "update";
      corpClientId: string;
      salesManagerUserId: string;
      salesManagerName: string | null;
      clientName: string;
    };

export function buildPendingSalesManagerApplyPlan(input: {
  corpClientId: string;
  pending: ManagerAssignment;
  existing: B2BClientRegistryEntry | null;
  clientName?: string | null;
}): PendingSalesManagerApplyPlan {
  const corpClientId = normalizeCorpClientId(input.corpClientId);
  if (!corpClientId || !input.pending.userId) return { action: "skip" };
  if (input.existing?.salesManager.userId) return { action: "skip" };
  return {
    action: input.existing ? "update" : "upsert",
    corpClientId: input.existing?.corpClientId || corpClientId,
    salesManagerUserId: input.pending.userId,
    salesManagerName: input.pending.name,
    clientName: input.clientName?.trim() || input.existing?.clientName || corpClientId,
  };
}

export async function applyPendingSalesManagerToCorpClient(
  corpClientId: string,
  pending: ManagerAssignment,
  options?: { clientName?: string | null },
): Promise<void> {
  const existing = await getB2BClientRegistryEntry(corpClientId);
  const plan = buildPendingSalesManagerApplyPlan({
    corpClientId,
    pending,
    existing,
    clientName: options?.clientName,
  });
  if (plan.action === "skip") return;

  if (plan.action === "upsert") {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase.from("gp_corp_client_map").upsert(
      {
        corp_client_id: plan.corpClientId,
        client_name: plan.clientName,
        sales_manager_user_id: plan.salesManagerUserId,
        sales_manager_name: plan.salesManagerName || plan.salesManagerUserId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "corp_client_id" },
    );
    if (error) throw new Error(error.message);
    return;
  }

  await updateB2BClientManagers(plan.corpClientId, {
    salesManagerUserId: plan.salesManagerUserId,
    salesManagerName: plan.salesManagerName,
  });
}
