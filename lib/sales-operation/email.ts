import { getSalesLeadById } from "@/lib/sales-operation/repository";
import { listSalesContacts } from "@/lib/sales-operation/contacts";
import { getEmailTemplateById } from "@/lib/sales-operation/email-templates";
import {
  plainTextToHtml,
  renderEmailTemplate,
  type EmailTemplateContext,
} from "@/lib/sales-operation/email-render";
import { sendEmail } from "@/lib/sales-operation/email-gateway";
import { logActivity } from "@/lib/sales-operation/activity";
import { logAudit } from "@/lib/sales-operation/audit";
import { createNotification } from "@/lib/sales-operation/notifications";
import {
  SALES_EMAIL_DIRECTIONS,
  SALES_EMAIL_STATUSES,
  type SalesEmailDirection,
  type SalesEmailMessage,
  type SalesEmailStatus,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeDirection(value: unknown): SalesEmailDirection {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_EMAIL_DIRECTIONS as readonly string[]).includes(raw)
    ? (raw as SalesEmailDirection)
    : "outbound";
}

function normalizeStatus(value: unknown): SalesEmailStatus {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_EMAIL_STATUSES as readonly string[]).includes(raw)
    ? (raw as SalesEmailStatus)
    : "logged";
}

function mapEmailRow(row: Record<string, unknown>): SalesEmailMessage {
  return {
    id: String(row.id),
    leadId: String(row.lead_id),
    direction: normalizeDirection(row.direction),
    status: normalizeStatus(row.status),
    fromAddress: readText(row.from_address),
    toAddress: readText(row.to_address),
    ccAddress: readText(row.cc_address),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    provider: readText(row.provider),
    providerMessageId: readText(row.provider_message_id),
    error: readText(row.error),
    templateId: typeof row.template_id === "string" ? row.template_id : null,
    actorUserId: typeof row.actor_user_id === "string" ? row.actor_user_id : null,
    actorName: readText(row.actor_name),
    occurredAt: String(row.occurred_at ?? row.created_at ?? new Date().toISOString()),
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

export async function listLeadEmails(leadId: string): Promise<SalesEmailMessage[]> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_email_messages")
    .select("*")
    .eq("lead_id", leadId)
    .order("occurred_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapEmailRow(row as Record<string, unknown>));
}

type RecordEmailInput = {
  leadId: string;
  direction: SalesEmailDirection;
  status: SalesEmailStatus;
  fromAddress?: string | null;
  toAddress?: string | null;
  ccAddress?: string | null;
  subject: string;
  body: string;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  templateId?: string | null;
  actor: { userId: string | null; name: string };
  occurredAt?: string;
};

export async function recordEmailMessage(input: RecordEmailInput): Promise<SalesEmailMessage> {
  const supabase = getSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_email_messages")
    .insert({
      lead_id: input.leadId,
      direction: input.direction,
      status: input.status,
      from_address: input.fromAddress ?? null,
      to_address: input.toAddress ?? null,
      cc_address: input.ccAddress ?? null,
      subject: input.subject,
      body: input.body,
      provider: input.provider ?? null,
      provider_message_id: input.providerMessageId ?? null,
      error: input.error ?? null,
      template_id: input.templateId ?? null,
      actor_user_id: input.actor.userId,
      actor_name: input.actor.name,
      occurred_at: input.occurredAt ?? now,
      created_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to record email.");
  return mapEmailRow(data as Record<string, unknown>);
}

export type SendLeadEmailInput = {
  to?: string;
  cc?: string;
  subject?: string;
  body?: string;
  templateId?: string;
};

/**
 * Renders (if a template is chosen), sends via SMTP, records the message on the
 * lead thread and logs activity/audit. Never throws for delivery failures — the
 * message is always recorded with the resulting status so the thread is truthful.
 */
export async function sendLeadEmail(
  leadId: string,
  input: SendLeadEmailInput,
  actor: { userId: string | null; name: string },
): Promise<SalesEmailMessage> {
  const lead = await getSalesLeadById(leadId);
  if (!lead) throw new Error("Lead not found.");

  const contacts = await listSalesContacts(leadId).catch(() => []);
  const primaryContact = contacts.find((contact) => contact.isPrimary) ?? contacts[0] ?? null;

  const context: EmailTemplateContext = {
    lead,
    contact: primaryContact,
    managerName: lead.assignedManagerName ?? actor.name,
  };

  let subject = input.subject ?? "";
  let body = input.body ?? "";
  let templateId: string | null = null;
  if (input.templateId) {
    const template = await getEmailTemplateById(input.templateId);
    if (template) {
      templateId = template.id;
      const rendered = renderEmailTemplate(
        { subject: input.subject ?? template.subject, body: input.body ?? template.body },
        context,
      );
      subject = rendered.subject;
      body = rendered.body;
    }
  }

  const to = (input.to ?? primaryContact?.email ?? lead.email ?? "").trim();
  if (!to) throw new Error("A recipient email is required.");
  if (!subject.trim()) throw new Error("A subject is required.");

  const sendResult = await sendEmail({
    to,
    cc: input.cc?.trim() || undefined,
    subject,
    text: body,
    html: plainTextToHtml(body),
  });

  const message = await recordEmailMessage({
    leadId,
    direction: "outbound",
    status: sendResult.status,
    fromAddress: sendResult.from,
    toAddress: to,
    ccAddress: input.cc?.trim() || null,
    subject,
    body,
    provider: sendResult.provider,
    providerMessageId: sendResult.providerMessageId,
    error: sendResult.error ?? sendResult.configError,
    templateId,
    actor,
  });

  await logActivity({
    leadId,
    type: "email",
    title: subject,
    body: sendResult.status === "sent" ? null : sendResult.error ?? sendResult.configError,
    meta: { direction: "outbound", status: sendResult.status, to },
    actor,
  });
  await logAudit({
    entityType: "lead",
    entityId: leadId,
    action: "updated",
    actor,
    summary: `Email ${sendResult.status}: ${subject}`,
  });

  return message;
}

export type RecordInboundEmailInput = {
  leadId: string;
  fromAddress: string;
  toAddress?: string | null;
  subject: string;
  body: string;
  occurredAt?: string;
};

/** Records an inbound email (from a parse/webhook service) and notifies the owner. */
export async function recordInboundEmail(
  input: RecordInboundEmailInput,
): Promise<SalesEmailMessage> {
  const lead = await getSalesLeadById(input.leadId);
  if (!lead) throw new Error("Lead not found.");

  const actor = { userId: null, name: input.fromAddress || "Inbound" };
  const message = await recordEmailMessage({
    leadId: input.leadId,
    direction: "inbound",
    status: "received",
    fromAddress: input.fromAddress,
    toAddress: input.toAddress ?? null,
    subject: input.subject,
    body: input.body,
    provider: "inbound",
    actor,
    occurredAt: input.occurredAt,
  });

  await logActivity({
    leadId: input.leadId,
    type: "email",
    title: input.subject,
    body: null,
    meta: { direction: "inbound", from: input.fromAddress },
    actor,
    occurredAt: input.occurredAt,
  });

  if (lead.assignedManagerUserId) {
    await createNotification({
      userId: lead.assignedManagerUserId,
      type: "system",
      title: `New email from ${input.fromAddress}`,
      body: input.subject,
      leadId: input.leadId,
      link: "/sales-operation/pipeline",
    });
  }

  return message;
}
