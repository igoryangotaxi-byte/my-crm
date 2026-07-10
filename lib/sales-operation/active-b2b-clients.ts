import { normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import type { OverviewB2BClient } from "@/lib/sales-operation/client-list";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export const ACTIVE_B2B_SINCE_ISO = "2026-01-01T00:00:00.000Z";

const PAGE_SIZE = 1000;

async function listActiveCorpClientIdsViaScan(
  sinceIso: string,
): Promise<Set<string>> {
  const ids = new Set<string>();
  const supabase = getSupabaseAdminClient();
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("gp_fct_order_raw")
      .select("corp_client_id")
      .not("corp_client_id", "is", null)
      .eq("success_order_flg", true)
      .gte("lcl_order_due_dttm", sinceIso)
      .order("corp_client_id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load active corp clients: ${error.message}`);
    }
    if (!data || data.length === 0) break;

    for (const row of data) {
      const id = normalizeCorpClientId(
        typeof row.corp_client_id === "string" ? row.corp_client_id : "",
      );
      if (id) ids.add(id);
    }

    if (data.length < PAGE_SIZE) break;
  }

  return ids;
}

/**
 * Distinct corp_client_id values with at least one successful trip since 2026-01-01.
 * Prefers SQL RPC `list_active_corp_client_ids_since`; falls back to paginated scan.
 */
export async function listActiveCorpClientIdsSince(
  sinceIso: string = ACTIVE_B2B_SINCE_ISO,
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!isSupabaseConfigured()) return ids;

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.rpc("list_active_corp_client_ids_since", {
    since_ts: sinceIso,
  });

  if (!error && Array.isArray(data)) {
    for (const row of data) {
      const raw =
        typeof row === "string"
          ? row
          : row && typeof row === "object" && "corp_client_id" in row
            ? String((row as { corp_client_id: unknown }).corp_client_id ?? "")
            : "";
      const id = normalizeCorpClientId(raw);
      if (id) ids.add(id);
    }
    return ids;
  }

  if (error) {
    console.warn(
      "list_active_corp_client_ids_since RPC unavailable, falling back to scan:",
      error.message,
    );
  }

  return listActiveCorpClientIdsViaScan(sinceIso);
}

export async function listActiveOverviewB2BClients(
  nameByCorpId: Record<string, string> = {},
  sinceIso: string = ACTIVE_B2B_SINCE_ISO,
): Promise<OverviewB2BClient[]> {
  const activeIds = await listActiveCorpClientIdsSince(sinceIso);
  return [...activeIds]
    .map((corpClientId) => ({
      corpClientId,
      clientName: nameByCorpId[corpClientId]?.trim() || corpClientId,
    }))
    .sort((a, b) => a.clientName.localeCompare(b.clientName, undefined, { sensitivity: "base" }));
}
