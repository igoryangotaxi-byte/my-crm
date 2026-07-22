import {
  getManagersByCorpClientIds,
  normalizeCorpClientId,
} from "@/lib/sales-operation/b2b-client-registry";
import { getSupabaseAdminClient } from "@/lib/supabase";

export type EnsureClientResult = {
  clientId: string;
  leadId: string;
  created: boolean;
  corpClientId: string;
  companyName: string;
};

/**
 * Resolve or create a CRM sales_clients row for a Yango corp client.
 * sales_clients.lead_id is NOT NULL, so a minimal signed lead is created when needed.
 */
export async function ensureSalesClientForCorpClient(
  corpClientIdRaw: string,
  actor: { userId: string | null; name: string },
  options?: { clientName?: string | null },
): Promise<EnsureClientResult> {
  const corpClientId = normalizeCorpClientId(corpClientIdRaw);
  if (!corpClientId) {
    throw new Error("corpClientId is required.");
  }

  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("sales_clients")
    .select("id, lead_id, company_name, full_name")
    .eq("corp_client_id", corpClientId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);

  if (existing) {
    return {
      clientId: String(existing.id),
      leadId: String(existing.lead_id),
      created: false,
      corpClientId,
      companyName:
        (typeof existing.company_name === "string" && existing.company_name.trim()) ||
        (typeof existing.full_name === "string" && existing.full_name.trim()) ||
        corpClientId,
    };
  }

  const registry = await getManagersByCorpClientIds([corpClientId]);
  const entry = registry.get(corpClientId);
  const label =
    options?.clientName?.trim() ||
    entry?.clientName?.trim() ||
    corpClientId;

  const now = new Date().toISOString();
  const leadPayload = {
    status: "signed",
    source: "manual",
    full_name: label,
    company_name: label,
    corp_client_id: corpClientId,
    custom_fields: { ensured_from_b2b: true },
    status_entered_at: now,
    created_by_user_id: actor.userId,
    created_by_name: actor.name,
    assigned_manager_user_id: entry?.salesManager.userId ?? actor.userId,
    assigned_manager_name: entry?.salesManager.name ?? actor.name,
    created_at: now,
    updated_at: now,
  };

  const { data: leadRow, error: leadError } = await supabase
    .from("sales_leads")
    .insert(leadPayload)
    .select("id")
    .single();
  if (leadError || !leadRow) {
    // Race: another request may have created the client between lookup and insert.
    const { data: raced } = await supabase
      .from("sales_clients")
      .select("id, lead_id, company_name, full_name")
      .eq("corp_client_id", corpClientId)
      .maybeSingle();
    if (raced) {
      return {
        clientId: String(raced.id),
        leadId: String(raced.lead_id),
        created: false,
        corpClientId,
        companyName:
          (typeof raced.company_name === "string" && raced.company_name.trim()) ||
          (typeof raced.full_name === "string" && raced.full_name.trim()) ||
          corpClientId,
      };
    }
    throw new Error(leadError?.message ?? "Failed to create lead for B2B client.");
  }

  const leadId = String(leadRow.id);
  const clientPayload = {
    lead_id: leadId,
    full_name: label,
    company_name: label,
    corp_client_id: corpClientId,
    custom_fields: { ensured_from_b2b: true },
    signed_at: now,
    pending_sales_manager_user_id: entry?.salesManager.userId ?? actor.userId,
    pending_sales_manager_name: entry?.salesManager.name ?? actor.name,
    created_at: now,
    updated_at: now,
  };

  const { data: clientRow, error: clientError } = await supabase
    .from("sales_clients")
    .insert(clientPayload)
    .select("id, lead_id, company_name, full_name")
    .single();

  if (clientError || !clientRow) {
    // Unique corp_client_id race — fetch winner and drop orphan lead best-effort.
    const { data: raced } = await supabase
      .from("sales_clients")
      .select("id, lead_id, company_name, full_name")
      .eq("corp_client_id", corpClientId)
      .maybeSingle();
    if (raced) {
      await supabase.from("sales_leads").delete().eq("id", leadId).neq("id", raced.lead_id);
      return {
        clientId: String(raced.id),
        leadId: String(raced.lead_id),
        created: false,
        corpClientId,
        companyName:
          (typeof raced.company_name === "string" && raced.company_name.trim()) ||
          (typeof raced.full_name === "string" && raced.full_name.trim()) ||
          corpClientId,
      };
    }
    throw new Error(clientError?.message ?? "Failed to create sales client.");
  }

  return {
    clientId: String(clientRow.id),
    leadId: String(clientRow.lead_id),
    created: true,
    corpClientId,
    companyName:
      (typeof clientRow.company_name === "string" && clientRow.company_name.trim()) ||
      (typeof clientRow.full_name === "string" && clientRow.full_name.trim()) ||
      corpClientId,
  };
}
