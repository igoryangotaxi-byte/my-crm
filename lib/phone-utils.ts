/**
 * Shared phone-number normalization helpers used by Request Rides forms,
 * the XLSX bulk parser, and the SMS dispatch flow.
 */

/** Strip whitespace and a leading apostrophe (Excel text-cell hint). */
export function normalizePhone(value: unknown): string {
  let text: string;
  if (value == null) {
    text = "";
  } else if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    text = String(value);
  } else {
    text = "";
  }
  text = text.trim();
  if (!text) return "";
  if (text.startsWith("'")) text = text.slice(1);
  return text.replace(/\s+/g, "").trim();
}

/**
 * Loose validation suitable for IL mobile numbers and international forms
 * (E.164-ish). Accepts +972..., 00972..., 0xx..., and bare digits 7–15 long.
 */
export function isLikelyPhone(value: string): boolean {
  const cleaned = value.replace(/[^\d+]/g, "");
  if (!cleaned) return false;
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    return /^\d{7,15}$/.test(digits);
  }
  return /^\d{7,15}$/.test(cleaned);
}

/** Strip every non-digit/non-plus character. Used to canonicalize SMS recipients. */
export function canonicalizePhone(value: unknown): string {
  const normalized = normalizePhone(value);
  return normalized.replace(/[^\d+]/g, "");
}

/**
 * Normalize + canonicalize → dedupe → keep order. Drops empty/invalid entries
 * silently. Used to assemble the final SMS recipient list, so dashes and
 * Excel-style separators are stripped before transmission.
 */
export function dedupePhones(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const phone = canonicalizePhone(v ?? "");
    if (!phone || !isLikelyPhone(phone)) continue;
    if (seen.has(phone)) continue;
    seen.add(phone);
    out.push(phone);
  }
  return out;
}

/**
 * Yango B2B `POST /2.0/users` validation expects Israeli mobile as digits only, `^972…`,
 * length 11–12 (see VALIDATION_ERROR from integration API).
 */
export function normalizePhoneForYangoCorpUserCreate(value: string): string {
  const d = value.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("972")) {
    return d.length > 12 ? d.slice(0, 12) : d;
  }
  if (d.startsWith("0") && d.length >= 9) {
    return `972${d.slice(1)}`.slice(0, 12);
  }
  if (d.length === 9 && d.startsWith("5")) {
    return `972${d}`;
  }
  if (d.length === 10 && d.startsWith("5")) {
    return `972${d}`.slice(0, 12);
  }
  return d;
}
