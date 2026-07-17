import {
  SALES_EMAIL_LOCALES,
  type SalesEmailLocale,
  type SalesEmailTemplate,
} from "@/lib/sales-operation/types";
import { getSupabaseAdminClient } from "@/lib/supabase";

function readText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeLocale(value: unknown): SalesEmailLocale {
  const raw = typeof value === "string" ? value.trim() : "";
  return (SALES_EMAIL_LOCALES as readonly string[]).includes(raw)
    ? (raw as SalesEmailLocale)
    : "en";
}

function mapTemplateRow(row: Record<string, unknown>): SalesEmailTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    subject: String(row.subject ?? ""),
    body: String(row.body ?? ""),
    locale: normalizeLocale(row.locale),
    isActive: row.is_active !== false,
    createdByUserId: typeof row.created_by_user_id === "string" ? row.created_by_user_id : null,
    createdByName: readText(row.created_by_name),
    createdAt: String(row.created_at ?? new Date().toISOString()),
    updatedAt: String(row.updated_at ?? new Date().toISOString()),
  };
}

export type ListEmailTemplatesOptions = { activeOnly?: boolean };

export async function listEmailTemplates(
  options: ListEmailTemplatesOptions = {},
): Promise<SalesEmailTemplate[]> {
  const supabase = getSupabaseAdminClient();
  let query = supabase.from("sales_email_templates").select("*").order("name", { ascending: true });
  if (options.activeOnly) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => mapTemplateRow(row as Record<string, unknown>));
}

export async function getEmailTemplateById(id: string): Promise<SalesEmailTemplate | null> {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from("sales_email_templates")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? mapTemplateRow(data as Record<string, unknown>) : null;
}

export type CreateEmailTemplateInput = {
  name: string;
  subject?: string;
  body?: string;
  locale?: SalesEmailLocale;
};

export async function createEmailTemplate(
  input: CreateEmailTemplateInput,
  actor: { userId: string | null; name: string },
): Promise<SalesEmailTemplate> {
  const supabase = getSupabaseAdminClient();
  const name = input.name.trim();
  if (!name) throw new Error("Template name is required.");
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("sales_email_templates")
    .insert({
      name,
      subject: input.subject?.trim() || "",
      body: input.body ?? "",
      locale: normalizeLocale(input.locale),
      created_by_user_id: actor.userId,
      created_by_name: actor.name,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to create template.");
  return mapTemplateRow(data as Record<string, unknown>);
}

export type UpdateEmailTemplateInput = {
  name?: string;
  subject?: string;
  body?: string;
  locale?: SalesEmailLocale;
  isActive?: boolean;
};

export async function updateEmailTemplate(
  id: string,
  input: UpdateEmailTemplateInput,
): Promise<SalesEmailTemplate> {
  const supabase = getSupabaseAdminClient();
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Template name is required.");
    payload.name = name;
  }
  if (input.subject !== undefined) payload.subject = input.subject.trim();
  if (input.body !== undefined) payload.body = input.body;
  if (input.locale !== undefined) payload.locale = normalizeLocale(input.locale);
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  const { data, error } = await supabase
    .from("sales_email_templates")
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Failed to update template.");
  return mapTemplateRow(data as Record<string, unknown>);
}

export async function deleteEmailTemplate(id: string): Promise<void> {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase.from("sales_email_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
