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
import {
  buildSalesAnalyticsReport,
  type SalesAnalyticsReport,
} from "@/lib/sales-operation/analytics";
import { convertSignedLeadToClient } from "@/lib/sales-operation/convert-lead-to-client";
import { diffLeadFields, logAudit, summarizeChanges } from "@/lib/sales-operation/audit";
import { createNotification } from "@/lib/sales-operation/notifications";
import { listPipelineStages, listSegments } from "@/lib/sales-operation/pipeline-config";
import { runAutomationsForStatusChange } from "@/lib/sales-operation/automation/engine";
import type { UpdateSalesClientInput } from "@/lib/sales-operation/manager-types";
import {
  assertStageRequirements,
  assertValidStatusTransition,
} from "@/lib/sales-operation/status-transitions";
import {
  SALES_LEAD_COMPAT_STATUSES,
  SALES_LEAD_SOURCES,
  SALES_LEAD_STATUSES,
  type CreateSalesLeadInput,
  type SalesAnalyticsSummary,
  type SalesClient,
  type SalesClientNote,
  type SalesLead,
  type SalesLeadDealFields,
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

function isCompatStatus(value: string | null): value is SalesLeadStatus {
  return Boolean(value) && (SALES_LEAD_COMPAT_STATUSES as readonly string[]).includes(value as string);
}

function readNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function mapLeadRow(row: Record<string, unknown>): SalesLead {
  const customFields = readCustomFields(row);
  const dbStatus = normalizeStatus(row.status);
  const override = getPipelineStatusOverride(customFields);
  // Compat statuses (proposal_sent, negotiation) may be stored as in_progress + override
  // when the DB check-constraint predates them.
  const status: SalesLeadStatus =
    dbStatus === "in_progress" && isCompatStatus(override) ? (override as SalesLeadStatus) : dbStatus;

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
    assignedManagerUserId:
      typeof row.assigned_manager_user_id === "string" ? row.assigned_manager_user_id : null,
    assignedManagerName:
      typeof row.assigned_manager_name === "string" ? row.assigned_manager_name : null,
    legalName: readText(row.legal_name),
    companyRegNumber: readText(row.company_reg_number),
    website: readText(row.website),
    segmentId: readText(row.segment_id),
    subSegment: readText(row.sub_segment),
    employeesCount: readNumber(row.employees_count),
    estimatedMonthlyPotential: readNumber(row.estimated_monthly_potential),
    estimatedMonthlyTrips: readNumber(row.estimated_monthly_trips),
    expectedCloseDate: readText(row.expected_close_date),
    probabilityOverride: readNumber(row.probability_override),
    clientAddress: readText(row.client_address),
    generalNotes: readText(row.general_notes),
    isArchived: row.is_archived === true,
    archivedAt: readText(row.archived_at),
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
  preferNativeCompatStatus: boolean,
): { status: SalesLeadStatus; customFields: Record<string, unknown> } {
  if (isCompatStatus(status) && !preferNativeCompatStatus) {
    return {
      status: "in_progress",
      customFields: withPipelineStatusOverride(customFields, status),
    };
  }
  return {
    status,
    customFields: withPipelineStatusOverride(customFields, null),
  };
}

function eventStatusForDb(status: SalesLeadStatus, preferNativeCompatStatus: boolean): SalesLeadStatus {
  if (isCompatStatus(status) && !preferNativeCompatStatus) return "in_progress";
  return status;
}

/** Sets snake_case deal columns on an update/insert payload only for provided fields. */
function applyDealFieldsToPayload(
  payload: Record<string, unknown>,
  input: SalesLeadDealFields,
): void {
  if (input.legalName !== undefined) payload.legal_name = input.legalName?.trim() || null;
  if (input.companyRegNumber !== undefined)
    payload.company_reg_number = input.companyRegNumber?.trim() || null;
  if (input.website !== undefined) payload.website = input.website?.trim() || null;
  if (input.segmentId !== undefined) payload.segment_id = input.segmentId?.trim() || null;
  if (input.subSegment !== undefined) payload.sub_segment = input.subSegment?.trim() || null;
  if (input.employeesCount !== undefined) payload.employees_count = input.employeesCount ?? null;
  if (input.estimatedMonthlyPotential !== undefined)
    payload.estimated_monthly_potential = input.estimatedMonthlyPotential ?? null;
  if (input.estimatedMonthlyTrips !== undefined)
    payload.estimated_monthly_trips = input.estimatedMonthlyTrips ?? null;
  if (input.expectedCloseDate !== undefined)
    payload.expected_close_date = input.expectedCloseDate?.trim() || null;
  if (input.probabilityOverride !== undefined)
    payload.probability_override = input.probabilityOverride ?? null;
  if (input.clientAddress !== undefined) payload.client_address = input.clientAddress?.trim() || null;
  if (input.generalNotes !== undefined) payload.general_notes = input.generalNotes?.trim() || null;
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
    negotiation: "Negotiation",
    signed: "Signed",
    rejected: "Rejected",
  };
  return labels[status];
}

export type ListSalesLeadsOptions = {
  /** "active" (default) hides archived, "archived" only archived, "all" both. */
  archive?: "active" | "archived" | "all";
};

export async function listSalesLeads(
  options: ListSalesLeadsOptions = {},
): Promise<SalesLead[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_leads")
    .select("*")
    .order("status_entered_at", { ascending: false });
  const archive = options.archive ?? "active";
  if (archive === "active") query = query.eq("is_archived", false);
  else if (archive === "archived") query = query.eq("is_archived", true);
  const { data, error } = await query;
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
  const requestedStatus = input.status ? normalizeStatus(input.status) : "new";
  const encoded = encodeStatusForDb(
    requestedStatus,
    input.customFields ?? {},
    proposalSentPersistedNatively,
  );
  const payload: Record<string, unknown> = {
    status: encoded.status,
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
    custom_fields: encoded.customFields,
    status_entered_at: now,
    created_by_user_id: actor.userId,
    created_by_name: actor.name,
    created_at: now,
    updated_at: now,
  };
  if (input.assignedManagerUserId !== undefined) {
    payload.assigned_manager_user_id = input.assignedManagerUserId || null;
    payload.assigned_manager_name = input.assignedManagerUserId
      ? input.assignedManagerName?.trim() || input.assignedManagerUserId
      : null;
  }
  applyDealFieldsToPayload(payload, input);

  const { data, error } = await supabase.from("sales_leads").insert(payload).select("*").single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create lead.");

  const lead = mapLeadRow(data as Record<string, unknown>);
  await supabase.from("sales_lead_status_events").insert({
    lead_id: lead.id,
    from_status: null,
    to_status: eventStatusForDb(lead.status, proposalSentPersistedNatively),
    changed_by_user_id: actor.userId,
    changed_by_name: actor.name,
    created_at: now,
  });

  if (lead.assignedManagerUserId && lead.assignedManagerUserId !== actor.userId) {
    await createNotification({
      userId: lead.assignedManagerUserId,
      type: "lead_assigned",
      title: `You were assigned a lead: ${lead.companyName || lead.fullName}`,
      leadId: lead.id,
      link: "/sales-operation/pipeline",
    });
  }

  await logAudit({
    entityType: "lead",
    entityId: lead.id,
    action: "created",
    actor,
    summary: lead.companyName || lead.fullName,
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

export async function deleteSalesLead(
  id: string,
  actor: { userId: string | null; name: string } = { userId: null, name: "System" },
): Promise<void> {
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

  await logAudit({
    entityType: "lead",
    entityId: id,
    action: "deleted",
    actor,
    summary: existing.companyName || existing.fullName,
  });
}

/** Soft-archives (or restores) a lead. Archived leads are hidden from the active board. */
export async function setSalesLeadArchived(
  id: string,
  archived: boolean,
  actor: { userId: string | null; name: string },
): Promise<SalesLead> {
  const supabase = getSupabaseAdminClient();
  const existing = await getSalesLeadById(id);
  if (!existing) throw new Error("Lead not found.");

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    is_archived: archived,
    archived_at: archived ? now : null,
    archived_by_user_id: archived ? actor.userId : null,
    archived_by_name: archived ? actor.name : null,
    updated_at: now,
  };
  const { data, error } = await supabase
    .from("sales_leads")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update lead.");

  const lead = mapLeadRow(data as Record<string, unknown>);
  await logAudit({
    entityType: "lead",
    entityId: id,
    action: archived ? "archived" : "unarchived",
    actor,
    summary: lead.companyName || lead.fullName,
  });
  return lead;
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
    assertStageRequirements(nextStatus, {
      estimatedMonthlyPotential:
        input.estimatedMonthlyPotential !== undefined
          ? input.estimatedMonthlyPotential
          : existing.estimatedMonthlyPotential,
    });
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
    applyDealFieldsToPayload(payload, input);
    if (nextStatus !== existing.status) {
      payload.status = encoded.status;
      payload.status_entered_at = now;
      // First-touch Sales Manager: assign acting user when empty.
      if (!existing.assignedManagerUserId && actor.userId) {
        payload.assigned_manager_user_id = actor.userId;
        payload.assigned_manager_name = actor.name || actor.userId;
      }
    } else if (isCompatStatus(existing.status)) {
      // Keep DB encoding aligned for compat-status leads when editing other fields.
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

  if (nextStatus !== existing.status) {
    try {
      await runAutomationsForStatusChange(lead, existing.status, nextStatus);
    } catch (error) {
      console.error("Sales automation engine error:", error);
    }
  }

  const changes = diffLeadFields(existing, lead);
  if (Object.keys(changes).length > 0) {
    await logAudit({
      entityType: "lead",
      entityId: lead.id,
      action: nextStatus !== existing.status ? "status_changed" : "updated",
      actor,
      summary: summarizeChanges(changes),
      changes,
    });
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

export async function getSalesAnalyticsReport(): Promise<SalesAnalyticsReport> {
  const [leads, stages, segments] = await Promise.all([
    listSalesLeads(),
    listPipelineStages(),
    listSegments(),
  ]);
  return buildSalesAnalyticsReport(leads, stages, segments);
}
