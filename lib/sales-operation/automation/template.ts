import type { SalesLead } from "@/lib/sales-operation/types";

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function buildSmsTemplateVars(lead: SalesLead): Record<string, string> {
  return {
    full_name: lead.fullName ?? "",
    phone: lead.phone ?? "",
    company_name: lead.companyName ?? "",
    status: lead.status ?? "",
    email: lead.email ?? "",
  };
}

export function applyAutomationTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(PLACEHOLDER_RE, (_match, key: string) => {
    const value = vars[key];
    return value !== undefined ? value : "";
  });
}
