import { canonicalizePhone, isLikelyPhone } from "@/lib/phone-utils";

export const CALL_CENTER_DISPLAY_TZ = "Asia/Jerusalem";

/**
 * National Israel digits for lookup / create-dedup / call-report identity.
 * 054-123-4567, +972541234567, 972541234567 → 541234567
 * 03-7778504, +97237778504 → 37778504
 */
export function israelPhoneKey(raw: string | null | undefined): string {
  let digits = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (!digits) return "";
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("972")) digits = digits.slice(3);
  if (digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

export function israelPhonesMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = israelPhoneKey(a);
  const right = israelPhoneKey(b);
  return Boolean(left && right && left === right);
}

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

export function formatCallAtJerusalem(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    timeZone: CALL_CENTER_DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
