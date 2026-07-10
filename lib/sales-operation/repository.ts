import {
  getPipelineStatusOverride,
  withPipelineStatusOverride,
} from "@/lib/sales-operation/proposal-sent-compat";
import {
  applyPendingSalesManagerToCorpClient,
  getManagersByCorpClientIds,
  normalizeCorpClientId,
  updateB2BClientManagers,
} from "@/lib/sales-operation/b2b-client-registry";
import { convertSignedLeadToClient } from "@/lib/sales-operation/convert-lead-to-client";
import type { UpdateSalesClientInput } from "@/lib/sales-operation/manager-types";
import { assertValidStatusTransition } from "@/lib/sales-operation/status-transitions";
import {
  SALES_LEAD_SOURCES,
  SALES_LEAD_STATUSES,
  type CreateSalesLeadInput,
  type SalesAnalyticsSummary,
  type SalesClient,
  type SalesClientNote,
  type SalesLead,
  type SalesLeadNote,
  type SalesLeadSource,
  type SalesLeadStatus,
  type UpdateSalesLeadInput,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

let proposalSentPersistedNatively = false;

function normalizeStatus(value: unknown): SalesLeadStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_LEAD_STATUSES as readonly string[]).includes(raw)
    ? (raw as SalesLeadStatus)
    : "new";
}

function normalizeSource(value: unknown): SalesLeadSource {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_LEAD_SOURCES as readonly string[]).includes(raw)
    ? (raw as SalesLeadSource)
    : "manual";
}

function readCustomFields(row: Record<string, unknown>): Record<string, unknown> {
  return row.custom_fields && typeof row.custom_fields === "object" && !Array.isArray(row.custom_fields)
    ? (row.custom_fields as Record<string, unknown>)
    : {};
}

function mapLeadRow(row: Record<string, unknown>): SalesLead {
  const customFields = readCustomFields(row);
  const dbStatus = normalizeStatus(row.status);
  const override = getPipelineStatusOverride(customFields);
  const status: SalesLeadStatus =
    dbStatus === "proposal_sent" ||
    (dbStatus === "in_progress" && override === "proposal_sent")
      ? "proposal_sent"
      : dbStatus;

  return {
    id: String(row.id),
    status,
    source: normalizeSource(row.source),
    fullName: String(row.full_name ?? ""),
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    companyName: typeof row.company_name === "string" ? row.company_name : null,
    campaignId: typeof row.campaign_id === "string" ? row.campaign_id : null,
    campaignName: typeof row.campaign_name === "string" ? row.campaign_name : null,
    adId: typeof row.ad_id === "string" ? row.ad_id : null,
    adName: typeof row.ad_name === "string" ? row.ad_name : null,
    formId: typeof row.form_id === "string" ? row.form_id : null,
    customFields,
    statusEnteredAt: String(row.status_entered_at ?? row.created_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
  };
}

function encodeStatusForDb(
  status: SalesLeadStatus,
  customFields: Record<string, unknown>,
  preferNativeProposalSent: boolean,
): { status: SalesLeadStatus; customFields: Record<string, unknown> } {
  if (status === "proposal_sent" && !preferNativeProposalSent) {
    return {
      status: "in_progress",
      customFields: withPipelineStatusOverride(customFields, "proposal_sent"),
    };
  }
  return {
    status,
    customFields: withPipelineStatusOverride(customFields, null),
  };
}

function eventStatusForDb(status: SalesLeadStatus, preferNativeProposalSent: boolean): SalesLeadStatus {
  if (status === "proposal_sent" && !preferNativeProposalSent) return "in_progress";
  return status;
}

function mapLeadNoteRow(row: Record<string, unknown>): SalesLeadNote {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    authorUserId: typeof row.author_user_id === "string" ? row.author_user_id : null,
    authorName: String(row.author_name ?? "System"),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function mapClientRow(row: Record<string, unknown>): SalesClient {
  const corpClientIdRaw =
    typeof row.corp_client_id === "string" ? normalizeCorpClientId(row.corp_client_id) : "";
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    fullName: String(row.full_name ?? ""),
    email: typeof row.email === "string" ? row.email : null,
    phone: typeof row.phone === "string" ? row.phone : null,
    companyName: typeof row.company_name === "string" ? row.company_name : null,
    campaignId: typeof row.campaign_id === "string" ? row.campaign_id : null,
    campaignName: typeof row.campaign_name === "string" ? row.campaign_name : null,
    adId: typeof row.ad_id === "string" ? row.ad_id : null,
    adName: typeof row.ad_name === "string" ? row.ad_name : null,
    formId: typeof row.form_id === "string" ? row.form_id : null,
    customFields:
      row.custom_fields && typeof row.custom_fields === "object" && !Array.isArray(row.custom_fields)
        ? (row.custom_fields as Record<string, unknown>)
        : {},
    corpClientId: corpClientIdRaw || null,
    corpClientName: null,
    accountManagerUserId: null,
    accountManagerName: null,
    salesManagerUserId: null,
    salesManagerName: null,
    pendingSalesManagerUserId:
      typeof row.pending_sales_manager_user_id === "string" ? row.pending_sales_manager_user_id : null,
    pendingSalesManagerName:
      typeof row.pending_sales_manager_name === "string" ? row.pending_sales_manager_name : null,
    signedAt: String(row.signed_at ?? row.created_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

async function enrichSalesClients(clients: SalesClient[]): Promise<SalesClient[]> {
  const corpIds = clients
    .map((client) => client.corpClientId)
    .filter((value): value is string => Boolean(value));
  if (corpIds.length === 0) return clients;

  const registry = await getManagersByCorpClientIds(corpIds);
  return clients.map((client) => {
    if (!client.corpClientId) return client;
    const entry = registry.get(client.corpClientId);
    if (!entry) return client;
    return {
      ...client,
      corpClientName: entry.clientName,
      accountManagerUserId: entry.accountManager.userId,
      accountManagerName: entry.accountManager.name,
      salesManagerUserId: entry.salesManager.userId,
      salesManagerName: entry.salesManager.name,
    };
  });
}

function mapClientNoteRow(row: Record<string, unknown>): SalesClientNote {
  return {
    id: String(row.id),
    clientId: String(row.client_id),
    authorUserId: typeof row.author_user_id === "string" ? row.author_user_id : null,
    authorName: String(row.author_name ?? "System"),
    body: String(row.body ?? ""),
    sourceLeadNoteId: typeof row.source_lead_note_id === "string" ? row.source_lead_note_id : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function displayStatus(status: SalesLeadStatus): string {
  const labels: Record<SalesLeadStatus, string> = {
    new: "New",
    in_progress: "In Progress",
    proposal_sent: "Proposal Sent",
    signed: "Signed",
    rejected: "Rejected",
  };
  return labels[status];
}

export async function listSalesLeads(): Promise<SalesLead[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_leads")
    .select("*")
    .order("status_entered_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLeadRow(row as Record<string, unknown>));
}

export async function getSalesLeadById(id: string): Promise<SalesLead | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("sales_leads").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadRow(data as Record<string, unknown>) : null;
}

export async function createSalesLead(
  input: CreateSalesLeadInput,
  actor: { userId: string | null; name: string },
): Promise<SalesLead> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const status = input.status ? normalizeStatus(input.status) : "new";
  const payload = {
    status,
    source: input.source ? normalizeSource(input.source) : "manual",
    full_name: input.fullName.trim(),
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    company_name: input.companyName?.trim() || null,
    campaign_id: input.campaignId?.trim() || null,
    campaign_name: input.campaignName?.trim() || null,
    ad_id: input.adId?.trim() || null,
    ad_name: input.adName?.trim() || null,
    form_id: input.formId?.trim() || null,
    custom_fields: input.customFields ?? {},
    status_entered_at: now,
    created_by_user_id: actor.userId,
    created_by_name: actor.name,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase.from("sales_leads").insert(payload).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create lead.");

  const lead = mapLeadRow(data as Record<string, unknown>);
  await supabase.from("sales_lead_status_events").insert({
    lead_id: lead.id,
    from_status: null,
    to_status: lead.status,
    changed_by_user_id: actor.userId,
    changed_by_name: actor.name,
    created_at: now,
  });

  return lead;
}

export async function findSalesLeadByWpformsSubmissionId(
  submissionId: string,
): Promise<SalesLead | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_leads")
    .select("*")
    .eq("custom_fields->>wpforms_submission_id", submissionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadRow(data as Record<string, unknown>) : null;
}

export async function deleteSalesLead(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const existing = await getSalesLeadById(id);
  if (!existing) throw new Error("Lead not found.");

  const { data: client, error: clientError } = await supabase
    .from("sales_clients")
    .select("id")
    .eq("lead_id", id)
    .maybeSingle();
  if (clientError) throw new Error(clientError.message);
  if (client) {
    throw new Error("Cannot delete a lead that was converted to a client.");
  }

  const { error } = await supabase.from("sales_leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateSalesLead(
  id: string,
  input: UpdateSalesLeadInput,
  actor: { userId: string | null; name: string },
): Promise<SalesLead> {
  const supabase = getSupabaseAdminClient();
  const existing = await getSalesLeadById(id);
  if (!existing) throw new Error("Lead not found.");

  const now = new Date().toISOString();
  const nextStatus = input.status ? normalizeStatus(input.status) : existing.status;
  if (nextStatus !== existing.status) {
    assertValidStatusTransition(existing.status, nextStatus);
  }

  const baseCustomFields =
    input.customFields !== undefined ? input.customFields : existing.customFields;

  const writeUpdate = async (preferNativeProposalSent: boolean) => {
    const encoded = encodeStatusForDb(nextStatus, baseCustomFields, preferNativeProposalSent);
    const payload: Record<string, unknown> = {
      updated_at: now,
      custom_fields: encoded.customFields,
    };
    if (input.fullName !== undefined) payload.full_name = input.fullName.trim();
    if (input.email !== undefined) payload.email = input.email?.trim() || null;
    if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
    if (input.companyName !== undefined) payload.company_name = input.companyName?.trim() || null;
    if (input.campaignId !== undefined) payload.campaign_id = input.campaignId?.trim() || null;
    if (input.campaignName !== undefined) payload.campaign_name = input.campaignName?.trim() || null;
    if (input.adId !== undefined) payload.ad_id = input.adId?.trim() || null;
    if (input.adName !== undefined) payload.ad_name = input.adName?.trim() || null;
    if (input.formId !== undefined) payload.form_id = input.formId?.trim() || null;
    if (nextStatus !== existing.status) {
      payload.status = encoded.status;
      payload.status_entered_at = now;
    } else if (existing.status === "proposal_sent") {
      // Keep DB encoding aligned for proposal leads when editing other fields.
      payload.status = encoded.status;
    }

    const { data, error } = await supabase
      .from("sales_leads")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Failed to update lead.");
    return mapLeadRow(data as Record<string, unknown>);
  };

  const preferNative = proposalSentPersistedNatively;
  const lead = await writeUpdate(preferNative);

  if (nextStatus !== existing.status) {
    const { error: eventError } = await supabase.from("sales_lead_status_events").insert({
      lead_id: lead.id,
      from_status: eventStatusForDb(existing.status, preferNative),
      to_status: eventStatusForDb(nextStatus, preferNative),
      changed_by_user_id: actor.userId,
      changed_by_name: actor.name,
      created_at: now,
    });
    if (eventError) {
      console.error("Failed to write sales lead status event:", eventError.message);
    }
  }

  if (nextStatus === "signed" && existing.status !== "signed") {
    const notes = await listSalesLeadNotes(lead.id);
    await convertSignedLeadToClient(supabase, lead, notes, actor);
  }

  return lead;
}

export async function listSalesLeadNotes(leadId: string): Promise<SalesLeadNote[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLeadNoteRow(row as Record<string, unknown>));
}

export async function createSalesLeadNote(
  leadId: string,
  body: string,
  actor: { userId: string | null; name: string },
): Promise<SalesLeadNote> {
  const supabase = getSupabaseAdminClient();
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Note body is required.");

  const lead = await getSalesLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_lead_notes")
    .insert({
      lead_id: leadId,
      author_user_id: actor.userId,
      author_name: actor.name,
      body: trimmed,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create note.");
  return mapLeadNoteRow(data as Record<string, unknown>);
}

export async function listSalesClients(): Promise<SalesClient[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_clients")
    .select("*")
    .order("signed_at", { ascending: false });
  if (error) throw new Error(error.message);
  const clients = (data ?? []).map((row) => mapClientRow(row as Record<string, unknown>));
  return enrichSalesClients(clients);
}

export async function getSalesClientByLeadId(leadId: string): Promise<SalesClient | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_clients")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [client] = await enrichSalesClients([mapClientRow(data as Record<string, unknown>)]);
  return client ?? null;
}

export async function getSalesClientById(id: string): Promise<SalesClient | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.from("sales_clients").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [client] = await enrichSalesClients([mapClientRow(data as Record<string, unknown>)]);
  return client ?? null;
}

export async function updateSalesClient(
  id: string,
  input: UpdateSalesClientInput,
): Promise<SalesClient> {
  const supabase = getSupabaseAdminClient();
  const existing = await getSalesClientById(id);
  if (!existing) throw new Error("Client not found.");

  const now = new Date().toISOString();
  const clientPayload: Record<string, unknown> = { updated_at: now };

  if (input.corpClientId !== undefined) {
    const normalized = input.corpClientId ? normalizeCorpClientId(input.corpClientId) : null;
    if (normalized) {
      const registry = await getManagersByCorpClientIds([normalized]);
      if (!registry.has(normalized)) {
        throw new Error("B2B client not found in registry.");
      }
    }
    clientPayload.corp_client_id = normalized;
  }

  const { data, error } = await supabase
    .from("sales_clients")
    .update(clientPayload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update client.");

  const corpId =
    input.corpClientId !== undefined
      ? input.corpClientId
        ? normalizeCorpClientId(input.corpClientId)
        : null
      : existing.corpClientId;

  if (corpId) {
    const row = mapClientRow(data as Record<string, unknown>);
    if (row.pendingSalesManagerUserId) {
      await applyPendingSalesManagerToCorpClient(corpId, {
        userId: row.pendingSalesManagerUserId,
        name: row.pendingSalesManagerName,
      });
      await supabase
        .from("sales_clients")
        .update({
          pending_sales_manager_user_id: null,
          pending_sales_manager_name: null,
          updated_at: now,
        })
        .eq("id", id);
    }

    const managerUpdate: Parameters<typeof updateB2BClientManagers>[1] = {};
    if (input.accountManagerUserId !== undefined) {
      managerUpdate.accountManagerUserId = input.accountManagerUserId;
    }
    if (input.accountManagerName !== undefined) {
      managerUpdate.accountManagerName = input.accountManagerName;
    }
    if (input.salesManagerUserId !== undefined) {
      managerUpdate.salesManagerUserId = input.salesManagerUserId;
    }
    if (input.salesManagerName !== undefined) {
      managerUpdate.salesManagerName = input.salesManagerName;
    }
    if (Object.keys(managerUpdate).length > 0) {
      await updateB2BClientManagers(corpId, managerUpdate);
    }
  }

  const refreshed = await getSalesClientById(id);
  if (!refreshed) throw new Error("Client not found after update.");
  return refreshed;
}

export async function listSalesClientNotes(clientId: string): Promise<SalesClientNote[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_client_notes")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapClientNoteRow(row as Record<string, unknown>));
}

export async function getSalesAnalyticsSummary(): Promise<SalesAnalyticsSummary> {
  const leads = await listSalesLeads();
  const byStatus = SALES_LEAD_STATUSES.reduce(
    (acc, status) => {
      acc[status] = leads.filter((lead) => lead.status === status).length;
      return acc;
    },
    {} as Record<SalesLeadStatus, number>,
  );

  const campaignCounts = new Map<string, number>();
  for (const lead of leads) {
    const key = lead.campaignName?.trim() || "Unassigned";
    campaignCounts.set(key, (campaignCounts.get(key) ?? 0) + 1);
  }

  const topCampaigns = [...campaignCounts.entries()]
    .map(([campaignName, count]) => ({ campaignName, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const leadsTotal = leads.length;
  const signedConversionPct = leadsTotal > 0 ? (byStatus.signed / leadsTotal) * 100 : 0;

  return {
    leadsTotal,
    byStatus,
    signedConversionPct,
    topCampaigns,
    leadsByStatusChart: SALES_LEAD_STATUSES.map((status) => ({
      status: displayStatus(status),
      count: byStatus[status],
    })),
    topCampaignsChart: topCampaigns,
  };
}
