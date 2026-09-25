/** Rejected substatus for applicants without a taxi license. */
export const NO_TAXI_LICENSE_SUBSTATUS = "No license";

/**
 * Classify Elementor / sheet taxi-license answers (Hebrew/Arabic/Russian/English).
 */
export function classifyTaxiLicenseAnswer(
  raw: string | null | undefined,
): "yes" | "no" | "unknown" {
  if (raw == null) return "unknown";
  const v = String(raw).trim().toLowerCase();
  if (!v) return "unknown";

  // "כן, לא" and any answer containing no → no-license path
  if (
    v.includes("לא") ||
    v.includes("لا") ||
    v === "нет" ||
    v === "no" ||
    v === "false" ||
    v === "0"
  ) {
    return "no";
  }

  if (
    v === "כן" ||
    v === "כן_" ||
    v.startsWith("כן") ||
    v === "да" ||
    v === "yes" ||
    v === "true" ||
    v === "1"
  ) {
    return "yes";
  }

  return "unknown";
}
