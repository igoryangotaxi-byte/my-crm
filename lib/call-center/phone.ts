import { canonicalizePhone, isLikelyPhone } from "@/lib/phone-utils";

/**
 * Normalize a driver/contact phone for 3CX makecall destination.
 * Prefers digits-only Israeli MSISDN (972…) when the number looks local.
 */
export function normalizeDestinationForThreeCx(raw: string | null | undefined): string | null {
  const canonical = canonicalizePhone(raw ?? "");
  if (!canonical || !isLikelyPhone(canonical)) return null;

  const digits = canonical.replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("972")) {
    return digits.length > 12 ? digits.slice(0, 12) : digits;
  }
  if (digits.startsWith("0") && digits.length >= 9) {
    return `972${digits.slice(1)}`.slice(0, 12);
  }
  if (digits.length === 9 && digits.startsWith("5")) {
    return `972${digits}`;
  }
  if (digits.length === 10 && digits.startsWith("5")) {
    return `972${digits}`.slice(0, 12);
  }

  // International / extension-style: pass digits through (7–15).
  if (digits.length >= 7 && digits.length <= 15) return digits;
  return null;
}
