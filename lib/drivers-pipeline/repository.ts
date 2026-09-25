import { getSupabaseAdminClient } from "@/lib/supabase";
import {
  assertValidDriverStatusTransition,
  isDriverLeadStatus,
} from "@/lib/drivers-pipeline/status-transitions";
import type {
  CreateDriverLeadInput,
  DriverLead,
  DriverLeadNote,
  DriverLeadSource,
  DriverLeadStatus,
  UpdateDriverLeadInput,
} from "@/lib/drivers-pipeline/types";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readCustomFields(row: Record<string, unknown>): Record<string, unknown> {
  const raw = row.custom_fields;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return {};
}

function normalizeStatus(value: unknown): DriverLeadStatus {
  if (isDriverLeadStatus(value)) return value;
  return "new";
}

function normalizeSource(value: unknown): DriverLeadSource {
  if (value === "import" || value === "wordpress" || value === "manual") return value;
  return "manual";
}

function mapLeadRow(row: Record<string, unknown>): DriverLead {
  return {
    id: String(row.id),
    status: normalizeStatus(row.status),
    source: normalizeSource(row.source),
    fullName: String(row.full_name ?? ""),
    email: readText(row.email),
    phone: readText(row.phone),
    rejectedSubstatus: readText(row.rejected_substatus),
    campaignName: readText(row.campaign_name),
    formId: readText(row.form_id),
    customFields: readCustomFields(row),
    assignedManagerUserId: readText(row.assigned_manager_user_id),
    assignedManagerName: readText(row.assigned_manager_name),
    generalNotes: readText(row.general_notes),
    statusEnteredAt: String(row.status_entered_at ?? row.created_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
    createdByUserId: readText(row.created_by_user_id),
    createdByName: readText(row.created_by_name),
  };
}

function mapNoteRow(row: Record<string, unknown>): DriverLeadNote {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    authorUserId: readText(row.author_user_id),
    authorName: String(row.author_name ?? "System"),
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
  };
}

export async function listDriverLeads(): Promise<DriverLead[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("driver_leads")
    .select("*")
    .order("status_entered_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapLeadRow(row as Record<string, unknown>));
}

export async function getDriverLeadById(id: string): Promise<DriverLead | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("driver_leads")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadRow(data as Record<string, unknown>) : null;
}

export async function findDriverLeadBySubmissionId(
  submissionId: string,
): Promise<DriverLead | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("driver_leads")
    .select("*")
    .eq("custom_fields->>submission_id", submissionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadRow(data as Record<string, unknown>) : null;
}

export async function findDriverLeadBySheetRowKey(
  sheetRowKey: string,
): Promise<DriverLead | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("driver_leads")
    .select("*")
    .eq("custom_fields->>sheet_row_key", sheetRowKey)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapLeadRow(data as Record<string, unknown>) : null;
}

export async function createDriverLead(
  input: CreateDriverLeadInput,
  actor: { userId: string | null; name: string },
): Promise<DriverLead> {
  const fullName = input.fullName?.trim();
  if (!fullName) throw new Error("fullName is required.");

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const status = input.status ? normalizeStatus(input.status) : "new";
  const rejectedSubstatus =
    status === "rejected" ? input.rejectedSubstatus?.trim() || null : null;

  const payload: Record<string, unknown> = {
    status,
    source: input.source ? normalizeSource(input.source) : "manual",
    full_name: fullName,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    rejected_substatus: rejectedSubstatus,
    campaign_name: input.campaignName?.trim() || null,
    form_id: input.formId?.trim() || null,
    custom_fields: input.customFields ?? {},
    general_notes: input.generalNotes?.trim() || null,
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
  } else if (input.assignedManagerName?.trim()) {
    payload.assigned_manager_name = input.assignedManagerName.trim();
  }

  const { data, error } = await supabase
    .from("driver_leads")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create driver lead.");

  const lead = mapLeadRow(data as Record<string, unknown>);
  await supabase.from("driver_lead_status_events").insert({
    lead_id: lead.id,
    from_status: null,
    to_status: lead.status,
    changed_by_user_id: actor.userId,
    changed_by_name: actor.name,
    created_at: now,
  });

  return lead;
}

export async function updateDriverLead(
  id: string,
  input: UpdateDriverLeadInput,
  actor: { userId: string | null; name: string },
): Promise<DriverLead> {
  const supabase = getSupabaseAdminClient();
  const existing = await getDriverLeadById(id);
  if (!existing) throw new Error("Lead not found.");

  const now = new Date().toISOString();
  const nextStatus = input.status ? normalizeStatus(input.status) : existing.status;
  if (nextStatus !== existing.status) {
    assertValidDriverStatusTransition(existing.status, nextStatus);
  }

  const payload: Record<string, unknown> = { updated_at: now };
  if (input.fullName !== undefined) payload.full_name = input.fullName.trim();
  if (input.email !== undefined) payload.email = input.email?.trim() || null;
  if (input.phone !== undefined) payload.phone = input.phone?.trim() || null;
  if (input.campaignName !== undefined) payload.campaign_name = input.campaignName?.trim() || null;
  if (input.formId !== undefined) payload.form_id = input.formId?.trim() || null;
  if (input.customFields !== undefined) payload.custom_fields = input.customFields;
  if (input.generalNotes !== undefined) payload.general_notes = input.generalNotes?.trim() || null;
  if (input.source !== undefined) payload.source = normalizeSource(input.source);

  if (input.rejectedSubstatus !== undefined || nextStatus !== existing.status) {
    payload.rejected_substatus =
      nextStatus === "rejected"
        ? (input.rejectedSubstatus !== undefined
            ? input.rejectedSubstatus?.trim() || null
            : existing.rejectedSubstatus)
        : null;
  }

  if (nextStatus !== existing.status) {
    payload.status = nextStatus;
    payload.status_entered_at = now;
    if (
      input.assignedManagerUserId === undefined &&
      !existing.assignedManagerUserId &&
      actor.userId
    ) {
      payload.assigned_manager_user_id = actor.userId;
      payload.assigned_manager_name = actor.name || actor.userId;
    }
  }

  if (input.assignedManagerUserId !== undefined) {
    payload.assigned_manager_user_id = input.assignedManagerUserId || null;
    payload.assigned_manager_name = input.assignedManagerUserId
      ? input.assignedManagerName?.trim() || input.assignedManagerUserId
      : null;
  } else if (input.assignedManagerName !== undefined) {
    payload.assigned_manager_name = input.assignedManagerName?.trim() || null;
  }

  const { data, error } = await supabase
    .from("driver_leads")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update driver lead.");

  const lead = mapLeadRow(data as Record<string, unknown>);
  if (nextStatus !== existing.status) {
    await supabase.from("driver_lead_status_events").insert({
      lead_id: lead.id,
      from_status: existing.status,
      to_status: nextStatus,
      changed_by_user_id: actor.userId,
      changed_by_name: actor.name,
      created_at: now,
    });
  }
  return lead;
}

export async function transitionDriverLead(
  id: string,
  toStatus: DriverLeadStatus,
  actor: { userId: string | null; name: string },
  options?: { rejectedSubstatus?: string | null },
): Promise<DriverLead> {
  return updateDriverLead(
    id,
    {
      status: toStatus,
      rejectedSubstatus:
        toStatus === "rejected" ? options?.rejectedSubstatus ?? null : null,
    },
    actor,
  );
}

export async function deleteDriverLead(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const existing = await getDriverLeadById(id);
  if (!existing) throw new Error("Lead not found.");
  const { error } = await supabase.from("driver_leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listDriverLeadNotes(leadId: string): Promise<DriverLeadNote[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("driver_lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapNoteRow(row as Record<string, unknown>));
}

export async function createDriverLeadNote(
  leadId: string,
  body: string,
  actor: { userId: string | null; name: string },
): Promise<DriverLeadNote> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Note body is required.");
  const existing = await getDriverLeadById(leadId);
  if (!existing) throw new Error("Lead not found.");

  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("driver_lead_notes")
    .insert({
      lead_id: leadId,
      author_user_id: actor.userId,
      author_name: actor.name || "System",
      body: trimmed,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create note.");
  return mapNoteRow(data as Record<string, unknown>);
}
