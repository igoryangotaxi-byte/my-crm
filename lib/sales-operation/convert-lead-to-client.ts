import { getSupabaseAdminClient } from "@/lib/supabase";
import { normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";
import { logActivity } from "@/lib/sales-operation/activity";
import { createNotification } from "@/lib/sales-operation/notifications";
import { createSalesTask } from "@/lib/sales-operation/tasks";
import type { SalesClient, SalesLead, SalesLeadNote } from "@/lib/sales-operation/types";

type SupabaseAdmin = ReturnType<typeof getSupabaseAdminClient>;

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

export async function convertSignedLeadToClient(
  supabase: SupabaseAdmin,
  lead: SalesLead,
  leadNotes: SalesLeadNote[],
  actor: { userId: string | null; name: string },
): Promise<SalesClient> {
  const now = new Date().toISOString();
  const clientPayload = {
    lead_id: lead.id,
    full_name: lead.fullName,
    email: lead.email,
    phone: lead.phone,
    company_name: lead.companyName,
    campaign_id: lead.campaignId,
    campaign_name: lead.campaignName,
    ad_id: lead.adId,
    ad_name: lead.adName,
    form_id: lead.formId,
    custom_fields: lead.customFields,
    signed_at: lead.statusEnteredAt || now,
    pending_sales_manager_user_id: actor.userId,
    pending_sales_manager_name: actor.name,
    updated_at: now,
  };

  const { data: existing, error: existingError } = await supabase
    .from("sales_clients")
    .select("*")
    .eq("lead_id", lead.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  let clientRow: Record<string, unknown>;
  if (existing) {
    const { data, error } = await supabase
      .from("sales_clients")
      .update(clientPayload)
      .eq("lead_id", lead.id)
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to update sales client.");
    }
    clientRow = data as Record<string, unknown>;
  } else {
    const { data, error } = await supabase
      .from("sales_clients")
      .insert({ ...clientPayload, created_at: now })
      .select("*")
      .single();
    if (error || !data) {
      throw new Error(error?.message ?? "Failed to create sales client.");
    }
    clientRow = data as Record<string, unknown>;
  }

  const client = mapClientRow(clientRow);

  if (leadNotes.length > 0) {
    const noteRows = leadNotes.map((note) => ({
      client_id: client.id,
      author_user_id: note.authorUserId,
      author_name: note.authorName,
      body: note.body,
      source_lead_note_id: note.id,
      created_at: note.createdAt,
      updated_at: note.updatedAt,
    }));

    const { error: notesError } = await supabase.from("sales_client_notes").upsert(noteRows, {
      onConflict: "source_lead_note_id",
      ignoreDuplicates: false,
    });
    if (notesError) {
      throw new Error(notesError.message);
    }
  }

  await runSignedHandover(lead, actor);

  return client;
}

/**
 * Handover when a lead is signed: create a high-priority onboarding task for the
 * owning manager, log the handover on the activity feed, and notify the owner.
 * Best-effort — failures here must never block the conversion.
 */
async function runSignedHandover(
  lead: SalesLead,
  actor: { userId: string | null; name: string },
): Promise<void> {
  const clientLabel = lead.companyName?.trim() || lead.fullName;
  const ownerUserId = lead.assignedManagerUserId ?? actor.userId;
  const ownerName = lead.assignedManagerName ?? actor.name;

  try {
    const dueAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await createSalesTask(
      lead.id,
      {
        title: `Onboard new client: ${clientLabel}`,
        taskType: "todo",
        priority: "high",
        dueAt,
        assignedToUserId: ownerUserId,
        assignedToName: ownerName,
      },
      { userId: actor.userId, name: actor.name },
    );
  } catch (error) {
    console.error("Handover onboarding task failed:", error);
  }

  await logActivity({
    leadId: lead.id,
    type: "status_changed",
    title: "Signed — handover to onboarding",
    body: `Converted to client${ownerName ? ` · owner ${ownerName}` : ""}.`,
    actor,
  });

  // Notify the owning manager when they did not perform the signing themselves.
  if (ownerUserId && ownerUserId !== actor.userId) {
    await createNotification({
      userId: ownerUserId,
      type: "system",
      title: `Client signed: ${clientLabel}`,
      body: "Onboarding handover created.",
      leadId: lead.id,
      link: "/sales-operation/b2b-clients",
    });
  }
}
