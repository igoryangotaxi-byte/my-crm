import {
  SALES_CONTACT_CHANNELS,
  type CreateSalesContactInput,
  type SalesContact,
  type SalesContactChannel,
  type UpdateSalesContactInput,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeChannel(value: unknown): SalesContactChannel | null {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_CONTACT_CHANNELS as readonly string[]).includes(raw)
    ? (raw as SalesContactChannel)
    : null;
}

function mapContactRow(row: Record<string, unknown>): SalesContact {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    fullName: String(row.full_name ?? ""),
    jobTitle: readText(row.job_title),
    department: readText(row.department),
    email: readText(row.email),
    mobilePhone: readText(row.mobile_phone),
    officePhone: readText(row.office_phone),
    preferredChannel: normalizeChannel(row.preferred_channel),
    isPrimary: Boolean(row.is_primary),
    isDecisionMaker: Boolean(row.is_decision_maker),
    notes: readText(row.notes),
    isActive: row.is_active === undefined ? true : Boolean(row.is_active),
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: typeof row.created_by_name === "string" ? row.created_by_name : null,
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

function isUniqueViolation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "23505") return true;
  return typeof error.message === "string" && error.message.includes("duplicate key");
}

function dedupError(): Error {
  return new Error("A contact with this email or phone already exists for this lead.");
}

export async function listSalesContacts(leadId: string): Promise<SalesContact[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_contacts")
    .select("*")
    .eq("lead_id", leadId)
    .order("is_primary", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapContactRow(row as Record<string, unknown>));
}

async function clearOtherPrimaries(leadId: string, exceptId: string | null): Promise<void> {
  const supabase = getSupabaseAdminClient();
  let query = supabase
    .from("sales_contacts")
    .update({ is_primary: false, updated_at: new Date().toISOString() })
    .eq("lead_id", leadId)
    .eq("is_primary", true);
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  if (error) throw new Error(error.message);
}

export async function createSalesContact(
  leadId: string,
  input: CreateSalesContactInput,
  actor: { userId: string | null; name: string },
): Promise<SalesContact> {
  const supabase = getSupabaseAdminClient();
  const fullName = input.fullName?.trim();
  if (!fullName) throw new Error("Contact name is required.");

  const { data: lead, error: leadError } = await supabase
    .from("sales_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead) throw new Error("Lead not found.");

  const wantsPrimary = Boolean(input.isPrimary);
  if (wantsPrimary) {
    await clearOtherPrimaries(leadId, null);
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    lead_id: leadId,
    full_name: fullName,
    job_title: input.jobTitle?.trim() || null,
    department: input.department?.trim() || null,
    email: input.email?.trim() || null,
    mobile_phone: input.mobilePhone?.trim() || null,
    office_phone: input.officePhone?.trim() || null,
    preferred_channel: normalizeChannel(input.preferredChannel),
    is_primary: wantsPrimary,
    is_decision_maker: Boolean(input.isDecisionMaker),
    notes: input.notes?.trim() || null,
    is_active: true,
    created_by_user_id: actor.userId,
    created_by_name: actor.name,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("sales_contacts")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    if (isUniqueViolation(error)) throw dedupError();
    throw new Error(error?.message ?? "Failed to create contact.");
  }
  return mapContactRow(data as Record<string, unknown>);
}

export async function updateSalesContact(
  contactId: string,
  input: UpdateSalesContactInput,
): Promise<SalesContact> {
  const supabase = getSupabaseAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("sales_contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (!existing) throw new Error("Contact not found.");

  const leadId = String((existing as Record<string, unknown>).lead_id);
  if (input.isPrimary === true) {
    await clearOtherPrimaries(leadId, contactId);
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { updated_at: now };
  if (input.fullName !== undefined) {
    const trimmed = input.fullName?.trim();
    if (!trimmed) throw new Error("Contact name is required.");
    payload.full_name = trimmed;
  }
  if (input.jobTitle !== undefined) payload.job_title = input.jobTitle?.trim() || null;
  if (input.department !== undefined) payload.department = input.department?.trim() || null;
  if (input.email !== undefined) payload.email = input.email?.trim() || null;
  if (input.mobilePhone !== undefined) payload.mobile_phone = input.mobilePhone?.trim() || null;
  if (input.officePhone !== undefined) payload.office_phone = input.officePhone?.trim() || null;
  if (input.preferredChannel !== undefined)
    payload.preferred_channel = normalizeChannel(input.preferredChannel);
  if (input.isPrimary !== undefined) payload.is_primary = Boolean(input.isPrimary);
  if (input.isDecisionMaker !== undefined)
    payload.is_decision_maker = Boolean(input.isDecisionMaker);
  if (input.notes !== undefined) payload.notes = input.notes?.trim() || null;
  if (input.isActive !== undefined) payload.is_active = Boolean(input.isActive);

  const { data, error } = await supabase
    .from("sales_contacts")
    .update(payload)
    .eq("id", contactId)
    .select("*")
    .single();
  if (error || !data) {
    if (isUniqueViolation(error)) throw dedupError();
    throw new Error(error?.message ?? "Failed to update contact.");
  }
  return mapContactRow(data as Record<string, unknown>);
}

export async function deleteSalesContact(contactId: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_contacts").delete().eq("id", contactId);
  if (error) throw new Error(error.message);
}
