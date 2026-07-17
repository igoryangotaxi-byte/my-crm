import type { SalesLead } from "@/lib/sales-operation/types";

export type DuplicateMatchField = "email" | "phone" | "company";

export type DuplicateCandidate = {
  email?: string | null;
  phone?: string | null;
  companyName?: string | null;
};

export type DuplicateMatch = {
  leadId: string;
  fullName: string;
  companyName: string | null;
  status: SalesLead["status"];
  matchedOn: DuplicateMatchField[];
};

/** Normalizes an email for equality checks (lowercase, trimmed). */
export function normalizeEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Normalizes a phone number to its digits for equality checks. */
export function normalizePhone(value: string | null | undefined): string {
  const digits = typeof value === "string" ? value.replace(/[^\d]/g, "") : "";
  // Compare on the last 9 digits so local/international formats still match.
  return digits.length > 9 ? digits.slice(-9) : digits;
}

/** Normalizes a company name (lowercase, collapse whitespace, strip punctuation). */
export function normalizeCompany(value: string | null | undefined): string {
  return typeof value === "string"
    ? value
        .trim()
        .toLowerCase()
        .replace(/[.,'"()]/g, "")
        .replace(/\s+/g, " ")
    : "";
}

/**
 * Pure duplicate detection: finds existing leads that share an email, phone or
 * company name with the candidate. Deterministic, ordered by match strength
 * (email > phone > company, then by number of matched fields).
 */
export function findDuplicateLeads(
  candidate: DuplicateCandidate,
  existing: SalesLead[],
  options: { excludeId?: string } = {},
): DuplicateMatch[] {
  const email = normalizeEmail(candidate.email);
  const phone = normalizePhone(candidate.phone);
  const company = normalizeCompany(candidate.companyName);
  if (!email && !phone && !company) return [];

  const matches: DuplicateMatch[] = [];
  for (const lead of existing) {
    if (options.excludeId && lead.id === options.excludeId) continue;
    const matchedOn: DuplicateMatchField[] = [];
    if (email && normalizeEmail(lead.email) === email) matchedOn.push("email");
    if (phone && normalizePhone(lead.phone) === phone) matchedOn.push("phone");
    if (company && normalizeCompany(lead.companyName) === company) matchedOn.push("company");
    if (matchedOn.length > 0) {
      matches.push({
        leadId: lead.id,
        fullName: lead.fullName,
        companyName: lead.companyName,
        status: lead.status,
        matchedOn,
      });
    }
  }

  const weight = (fields: DuplicateMatchField[]) =>
    (fields.includes("email") ? 4 : 0) +
    (fields.includes("phone") ? 2 : 0) +
    (fields.includes("company") ? 1 : 0);

  return matches.sort((a, b) => weight(b.matchedOn) - weight(a.matchedOn));
}
