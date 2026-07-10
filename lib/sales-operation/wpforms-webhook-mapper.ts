import type { CreateSalesLeadInput } from "@/lib/sales-operation/types";

const MAPPED_KEYS = new Set([
  "fullname",
  "full_name",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone",
  "tel",
  "mobile",
  "company",
  "company_name",
  "campaign_id",
  "campaignid",
  "campaign_name",
  "campaignname",
  "ad_id",
  "adid",
  "ad_name",
  "adname",
  "form_id",
  "formid",
  "submissionid",
  "submission_id",
  "entry_id",
  "entryid",
  "status",
  "source",
  "fields",
  "data",
  "payload",
  "body",
  "entry",
]);

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed.startsWith("{{") && trimmed.endsWith("}}")) return null;
    return trimmed;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function buildNormalizedBody(body: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...body };
  for (const [rawKey, rawValue] of Object.entries(body)) {
    const key = normalizeKey(rawKey);
    if (!(key in normalized)) normalized[key] = rawValue;
  }
  return normalized;
}

function pickString(body: Record<string, unknown>, keys: string[]): string | null {
  const normalized = buildNormalizedBody(body);
  for (const key of keys) {
    const value = readString(normalized[key] ?? normalized[normalizeKey(key)]);
    if (value) return value;
  }
  return null;
}

function assignFieldValue(
  flat: Record<string, unknown>,
  rawName: string,
  value: unknown,
): void {
  if (value === null || value === undefined || value === "") return;

  if (typeof value === "object" && !Array.isArray(value)) {
    const nameObj = value as Record<string, unknown>;
    const first = readString(nameObj.first ?? nameObj.first_name ?? nameObj.fname);
    const last = readString(nameObj.last ?? nameObj.last_name ?? nameObj.lname);
    if (first || last) {
      if (first) flat.first_name = flat.first_name ?? first;
      if (last) flat.last_name = flat.last_name ?? last;
      return;
    }
  }

  const fieldName = normalizeKey(rawName);
  flat[fieldName] = value;
  const asString = readString(value);
  if (!asString) return;

  if (fieldName.includes("email")) flat.email = flat.email ?? asString;
  if (fieldName.includes("phone") || fieldName.includes("tel") || fieldName.includes("mobile")) {
    flat.phone = flat.phone ?? asString;
  }
  if (fieldName.includes("company")) flat.company = flat.company ?? asString;
  if (
    fieldName === "name" ||
    fieldName === "full_name" ||
    fieldName === "fullname" ||
    fieldName.includes("full_name")
  ) {
    flat.name = flat.name ?? asString;
  }
}

function flattenWpformsFields(flat: Record<string, unknown>, fields: unknown): void {
  const fieldEntries = Array.isArray(fields)
    ? fields
    : typeof fields === "object" && fields !== null
      ? Object.values(fields as Record<string, unknown>)
      : [];

  for (const field of fieldEntries) {
    if (!field || typeof field !== "object") continue;
    const row = field as Record<string, unknown>;
    const label = String(row.name ?? row.label ?? row.field_name ?? row.id ?? "");
    const value = row.value ?? row.val ?? row.content ?? row.text;
    assignFieldValue(flat, label, value);
  }
}

export function flattenWpformsBody(raw: unknown): Record<string, unknown> {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    try {
      return flattenWpformsBody(JSON.parse(trimmed) as unknown);
    } catch {
      const params = new URLSearchParams(trimmed);
      if ([...params.keys()].length === 0) return {};
      const obj: Record<string, unknown> = {};
      for (const [key, value] of params.entries()) obj[key] = value;
      return flattenWpformsBody(obj);
    }
  }

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const body = { ...(raw as Record<string, unknown>) };

  for (const key of ["data", "payload", "body", "entry"] as const) {
    const wrapped = body[key];
    if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) {
      Object.assign(body, wrapped as Record<string, unknown>);
    }
  }

  if (body.fields) {
    flattenWpformsFields(body, body.fields);
  }

  return body;
}

function buildFullName(body: Record<string, unknown>): string | null {
  const direct = pickString(body, [
    "fullName",
    "full_name",
    "name",
    "fullname",
    "contact_name",
    "contactname",
  ]);
  if (direct) return direct;

  const first = pickString(body, ["first_name", "firstName", "fname"]);
  const last = pickString(body, ["last_name", "lastName", "lname"]);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined || null;
}

function extractSubmissionId(body: Record<string, unknown>): string | null {
  return pickString(body, [
    "submissionId",
    "submission_id",
    "entry_id",
    "entryId",
    "entryid",
    "id",
  ]);
}

export function mapWpformsPayloadToLeadInput(
  rawBody: Record<string, unknown>,
): { input: CreateSalesLeadInput; submissionId: string | null } {
  const body = flattenWpformsBody(rawBody);
  const fullName = buildFullName(body);
  if (!fullName) {
    throw new Error("fullName is required (name, full_name, or first_name + last_name).");
  }

  const submissionId = extractSubmissionId(body);
  const customFields: Record<string, unknown> = {};

  for (const [rawKey, rawValue] of Object.entries(body)) {
    const key = normalizeKey(rawKey);
    if (MAPPED_KEYS.has(key)) continue;
    if (rawValue === null || rawValue === undefined || rawValue === "") continue;
    customFields[rawKey] = rawValue;
  }

  if (submissionId) {
    customFields.wpforms_submission_id = submissionId;
  }

  const utmSource = pickString(body, ["source", "utm_source"]);
  const utmMedium = pickString(body, ["medium", "utm_medium"]);
  const utmCampaign = pickString(body, ["campaign", "utm_campaign"]);

  return {
    submissionId,
    input: {
      fullName,
      email: pickString(body, ["email"]),
      phone: pickString(body, ["phone", "phonenumber", "phone_number", "tel", "mobile"]),
      companyName: pickString(body, ["companyName", "company_name", "company"]),
      campaignId: pickString(body, ["campaignId", "campaign_id"]) ?? utmCampaign,
      campaignName:
        pickString(body, ["campaignName", "campaign_name"]) ??
        ([utmSource, utmMedium, utmCampaign].filter(Boolean).join(" / ") || null),
      adId: pickString(body, ["adId", "ad_id"]) ?? utmMedium,
      adName: pickString(body, ["adName", "ad_name"]) ?? utmSource,
      formId: pickString(body, ["formId", "form_id", "formid", "form"]),
      source: "wordpress",
      status: "new",
      customFields,
    },
  };
}

export async function parseWpformsWebhookBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";

  if (contentType.includes("application/json")) {
    const json = (await request.json().catch(() => null)) as unknown;
    return flattenWpformsBody(json);
  }

  const text = await request.text();
  if (!text.trim()) return {};

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(text);
    const obj: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) obj[key] = value;
    return flattenWpformsBody(obj);
  }

  return flattenWpformsBody(text);
}
