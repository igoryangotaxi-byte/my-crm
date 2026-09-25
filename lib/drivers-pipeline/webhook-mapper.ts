import type { CreateDriverLeadInput } from "@/lib/drivers-pipeline/types";
import {
  classifyTaxiLicenseAnswer,
  NO_TAXI_LICENSE_SUBSTATUS,
} from "@/lib/drivers-pipeline/taxi-license";

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (trimmed.startsWith("{{") && trimmed.endsWith("}}"))) return null;
    return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function pickString(body: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const direct = readString(body[key]);
    if (direct) return direct;
    const normalized = readString(body[normalizeKey(key)]);
    if (normalized) return normalized;
  }
  for (const [rawKey, rawValue] of Object.entries(body)) {
    const nk = normalizeKey(rawKey);
    if (keys.some((k) => normalizeKey(k) === nk)) {
      const v = readString(rawValue);
      if (v) return v;
    }
  }
  return null;
}

function flattenFields(fields: unknown): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const entries = Array.isArray(fields)
    ? fields
    : typeof fields === "object" && fields !== null
      ? Object.values(fields as Record<string, unknown>)
      : [];

  for (const field of entries) {
    if (!field || typeof field !== "object") continue;
    const row = field as Record<string, unknown>;
    const id = String(row.id ?? row.name ?? row.label ?? "");
    const value = row.value ?? row.raw_value ?? row.text;
    if (!id) continue;
    flat[normalizeKey(id)] = value;
    const asString = readString(value);
    if (!asString) continue;
    const lower = normalizeKey(id);
    if (lower.includes("email")) flat.email = flat.email ?? asString;
    if (lower.includes("phone") || lower.includes("tel") || lower === "field_845eff1") {
      flat.phone = flat.phone ?? asString;
    }
    if (lower === "name" || lower.includes("full_name")) flat.name = flat.name ?? asString;
  }
  return flat;
}

export async function parseDriversWebhookBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await request.json();
      return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
    }
    const text = await request.text();
    if (!text.trim()) return null;
    try {
      const json = JSON.parse(text) as unknown;
      return json && typeof json === "object" ? (json as Record<string, unknown>) : null;
    } catch {
      const params = new URLSearchParams(text);
      const out: Record<string, unknown> = {};
      for (const [k, v] of params.entries()) out[k] = v;
      return out;
    }
  } catch {
    return null;
  }
}

export function mapDriversWebhookPayloadToLeadInput(body: Record<string, unknown>): {
  input: CreateDriverLeadInput;
  submissionId: string | null;
} {
  const fieldsFlat = flattenFields(body.fields ?? body.form_fields);
  const merged: Record<string, unknown> = { ...fieldsFlat, ...body };

  const first = pickString(merged, ["first_name", "firstName", "fname"]);
  const last = pickString(merged, ["last_name", "lastName", "lname"]);
  const fullName =
    pickString(merged, ["fullName", "full_name", "name", "שם מלא"]) ||
    [first, last].filter(Boolean).join(" ").trim() ||
    null;

  if (!fullName) {
    throw new Error("fullName is required.");
  }

  const email = pickString(merged, ["email", "email_address", "אימייל"]);
  const phone = pickString(merged, [
    "phone",
    "tel",
    "mobile",
    "phone_number",
    "phonenumber",
    "field_845eff1",
    "טלפון",
  ]);
  const formId = pickString(merged, ["formId", "form_id", "elementor_form_id"]);
  const submissionId = pickString(merged, [
    "submissionId",
    "submission_id",
    "entry_id",
    "entryId",
  ]);
  const campaignName = pickString(merged, [
    "campaignName",
    "campaign_name",
    "campaign",
    "utm_campaign",
  ]);

  const customFields: Record<string, unknown> = {
    ...(typeof body.customFields === "object" && body.customFields && !Array.isArray(body.customFields)
      ? (body.customFields as Record<string, unknown>)
      : {}),
  };
  if (submissionId) customFields.submission_id = submissionId;
  const utmSource = pickString(merged, ["source", "utm_source"]);
  const utmMedium = pickString(merged, ["medium", "utm_medium"]);
  if (utmSource) customFields.utm_source = utmSource;
  if (utmMedium) customFields.utm_medium = utmMedium;
  const taxiLicense = pickString(merged, [
    "taxi_license",
    "taxiLicense",
    "taxi license?",
    "taxi license",
    "field_taxi_license",
    "license",
    "רישיון",
  ]);
  if (taxiLicense) customFields.taxi_license = taxiLicense;

  const licenseClass = classifyTaxiLicenseAnswer(taxiLicense);
  if (licenseClass === "no") {
    customFields.taxi_license_normalized = "no";
  } else if (licenseClass === "yes") {
    customFields.taxi_license_normalized = "yes";
  }

  const input: CreateDriverLeadInput = {
    fullName,
    email,
    phone,
    status: licenseClass === "no" ? "rejected" : "new",
    rejectedSubstatus: licenseClass === "no" ? NO_TAXI_LICENSE_SUBSTATUS : null,
    source: "wordpress",
    formId,
    campaignName,
    customFields,
  };

  return { input, submissionId };
}
