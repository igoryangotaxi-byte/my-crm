import type { SalesContact, SalesLead } from "@/lib/sales-operation/types";

/**
 * Variables available in email templates, referenced as {{group.key}}.
 * Kept explicit so the settings UI can advertise them and tests can assert them.
 */
export const EMAIL_TEMPLATE_VARIABLES = [
  "lead.fullName",
  "lead.company",
  "lead.email",
  "lead.phone",
  "contact.fullName",
  "contact.firstName",
  "contact.email",
  "manager.name",
  "date.today",
] as const;
export type EmailTemplateVariable = (typeof EMAIL_TEMPLATE_VARIABLES)[number];

export type EmailTemplateContext = {
  lead?: Pick<SalesLead, "fullName" | "companyName" | "email" | "phone"> | null;
  contact?: Pick<SalesContact, "fullName" | "email"> | null;
  managerName?: string | null;
  today?: string;
};

function firstNameOf(fullName: string | null | undefined): string {
  if (!fullName) return "";
  return fullName.trim().split(/\s+/)[0] ?? "";
}

/** Builds the flat variable map from CRM records. Deterministic and pure. */
export function buildTemplateVariables(
  context: EmailTemplateContext,
): Record<EmailTemplateVariable, string> {
  const lead = context.lead ?? null;
  const contact = context.contact ?? null;
  const today = context.today ?? new Date().toISOString().slice(0, 10);
  return {
    "lead.fullName": lead?.fullName ?? "",
    "lead.company": lead?.companyName ?? "",
    "lead.email": lead?.email ?? "",
    "lead.phone": lead?.phone ?? "",
    "contact.fullName": contact?.fullName ?? "",
    "contact.firstName": firstNameOf(contact?.fullName),
    "contact.email": contact?.email ?? "",
    "manager.name": context.managerName ?? "",
    "date.today": today,
  };
}

/**
 * Replaces {{group.key}} placeholders with values. Unknown placeholders are left
 * untouched. Whitespace inside the braces is tolerated ({{ lead.company }}).
 */
export function renderTemplateString(
  template: string,
  variables: Record<string, string>,
): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key: string) => {
    const value = variables[key];
    return value === undefined ? match : value;
  });
}

export type RenderedEmail = { subject: string; body: string };

/** Renders a template's subject + body against a CRM context. */
export function renderEmailTemplate(
  template: { subject: string; body: string },
  context: EmailTemplateContext,
): RenderedEmail {
  const variables = buildTemplateVariables(context);
  return {
    subject: renderTemplateString(template.subject, variables),
    body: renderTemplateString(template.body, variables),
  };
}

/** Minimal, safe HTML wrapper for a plain-text body (preserves line breaks). */
export function plainTextToHtml(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\r?\n/g, "<br />");
}
