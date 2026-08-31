import { normalizePhone } from "@/lib/sales-operation/dedup";
import { createSalesLead } from "@/lib/sales-operation/repository";
import { getSupabaseAdminClient, isSupabaseConfigured } from "@/lib/supabase";

export type BarOzLookupContact = {
  ID: string;
  First_Name: string;
  Last_Name: string;
  Company_Name: string;
  Email: string;
  Phone_Business: string;
  Phone_Business2: string;
  Phone_Mobile: string;
  Phone_Mobile2: string;
  Contact_URL: string;
};

function appOrigin(): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() ||
    process.env.VERCEL_URL?.trim();
  if (fromEnv) {
    return fromEnv.startsWith("http")
      ? fromEnv.replace(/\/+$/, "")
      : `https://${fromEnv.replace(/\/+$/, "")}`;
  }
  return "https://applitaxi.space";
}

export function contactUrlForLead(leadId: string): string {
  return `${appOrigin()}/sales-operation/pipeline?lead=${encodeURIComponent(leadId)}`;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Unknown", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function toLookupContact(params: {
  id: string;
  fullName: string;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile2?: string | null;
  business?: string | null;
}): BarOzLookupContact {
  const { first, last } = splitName(params.fullName || "Unknown");
  return {
    ID: params.id,
    First_Name: first,
    Last_Name: last,
    Company_Name: params.companyName?.trim() || "",
    Email: params.email?.trim() || "",
    Phone_Business: params.business?.trim() || "",
    Phone_Business2: "",
    Phone_Mobile: params.phone?.trim() || "",
    Phone_Mobile2: params.mobile2?.trim() || "",
    Contact_URL: contactUrlForLead(params.id),
  };
}

export function assertThreeCxWebhookAuthorized(request: Request): Response | null {
  const expected = process.env.THREECX_CRM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return Response.json(
      { ok: false, error: "THREECX_CRM_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }
  const url = new URL(request.url);
  const key =
    url.searchParams.get("key")?.trim() ||
    request.headers.get("x-3cx-webhook-key")?.trim() ||
    "";
  if (key !== expected) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

/** Lookup lead/contact by phone for Bar Oz Lookup By Phone. */
export async function lookupContactByPhone(phoneRaw: string): Promise<BarOzLookupContact | null> {
  if (!isSupabaseConfigured()) return null;
  const phoneKey = normalizePhone(phoneRaw);
  if (!phoneKey) return null;

  const supabase = getSupabaseAdminClient();

  const { data: leads, error: leadsError } = await supabase
    .from("sales_leads")
    .select("id, full_name, company_name, email, phone")
    .not("phone", "is", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (leadsError) throw new Error(leadsError.message);

  for (const row of leads ?? []) {
    const phone = typeof row.phone === "string" ? row.phone : "";
    if (normalizePhone(phone) === phoneKey) {
      return toLookupContact({
        id: String(row.id),
        fullName: String(row.full_name ?? "Unknown"),
        companyName: typeof row.company_name === "string" ? row.company_name : null,
        email: typeof row.email === "string" ? row.email : null,
        phone,
      });
    }
  }

  const { data: contacts, error: contactsError } = await supabase
    .from("sales_contacts")
    .select("id, lead_id, full_name, email, mobile_phone, office_phone")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (contactsError) throw new Error(contactsError.message);

  for (const row of contacts ?? []) {
    const mobile = typeof row.mobile_phone === "string" ? row.mobile_phone : "";
    const office = typeof row.office_phone === "string" ? row.office_phone : "";
    if (normalizePhone(mobile) === phoneKey || normalizePhone(office) === phoneKey) {
      return toLookupContact({
        id: String(row.lead_id ?? row.id),
        fullName: String(row.full_name ?? "Unknown"),
        email: typeof row.email === "string" ? row.email : null,
        phone: mobile || office,
        business: office || null,
        mobile2: mobile && office && normalizePhone(mobile) !== normalizePhone(office) ? office : null,
      });
    }
  }

  return null;
}

export async function createContactFromThreeCx(input: {
  firstName: string;
  lastName?: string | null;
  company?: string | null;
  email?: string | null;
  phone: string;
}): Promise<BarOzLookupContact> {
  const phone = input.phone.trim();
  if (!phone) throw new Error("Phone is required.");
  const first = input.firstName.trim() || "Unknown";
  const last = input.lastName?.trim() || "";
  const fullName = [first, last].filter(Boolean).join(" ");

  const existing = await lookupContactByPhone(phone);
  if (existing) return existing;

  const lead = await createSalesLead(
    {
      fullName,
      phone,
      email: input.email?.trim() || null,
      companyName: input.company?.trim() || null,
      source: "manual",
      status: "new",
      customFields: { created_via: "3cx_add_contact" },
    },
    { userId: null, name: "3CX" },
  );

  return toLookupContact({
    id: lead.id,
    fullName: lead.fullName,
    companyName: lead.companyName,
    email: lead.email,
    phone: lead.phone,
  });
}

export function readBarOzString(
  body: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
