import type { DriverLead } from "@/lib/drivers-pipeline/types";

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

/** Leads rejected / tagged as no taxi license — excluded from main Drivers dashboards. */
export function isDriverNoLicenseLead(lead: DriverLead): boolean {
  if (lead.rejectedSubstatus === NO_TAXI_LICENSE_SUBSTATUS) return true;
  const normalized = lead.customFields?.taxi_license_normalized;
  if (normalized === "no") return true;
  const raw = lead.customFields?.taxi_license;
  if (typeof raw === "string" && classifyTaxiLicenseAnswer(raw) === "no") return true;
  return false;
}

export function driverTaxiLicenseBucket(
  lead: DriverLead,
): "with" | "without" | "unknown" {
  if (isDriverNoLicenseLead(lead)) return "without";
  const normalized = lead.customFields?.taxi_license_normalized;
  if (normalized === "yes") return "with";
  const raw = lead.customFields?.taxi_license;
  if (typeof raw === "string") {
    const classified = classifyTaxiLicenseAnswer(raw);
    if (classified === "yes") return "with";
    if (classified === "no") return "without";
  }
  return "unknown";
}
