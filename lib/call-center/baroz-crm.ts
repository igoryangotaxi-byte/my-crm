import { israelPhoneKey, israelPhonesMatch } from "@/lib/call-center/phone";
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

/** Create Contact Record response — subset of lookup fields per Bar Oz PDF. */
export type BarOzCreateContact = {
  ID: string;
  First_Name: string;
  Last_Name: string;
  Company_Name: string;
  Email: string;
  Phone_Mobile: string;
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

export function contactUrlForClient(clientId: string): string {
  return `${appOrigin()}/sales-operation/b2b-clients/${encodeURIComponent(clientId)}`;
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
  contactUrl: string;
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
    Contact_URL: params.contactUrl,
  };
}

export function toCreateContactResponse(
  contact: BarOzLookupContact,
  fallbackPhone?: string | null,
): BarOzCreateContact {
  return {
    ID: contact.ID,
    First_Name: contact.First_Name,
    Last_Name: contact.Last_Name,
    Company_Name: contact.Company_Name,
    Email: contact.Email,
    Phone_Mobile: contact.Phone_Mobile || fallbackPhone?.trim() || "",
    Contact_URL: contact.Contact_URL,
  };
}

export function readThreeCxWebhookKey(request: Request): string {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("key")?.trim() || "";
  if (fromQuery) return fromQuery;

  const fromHeader =
    request.headers.get("x-3cx-webhook-key")?.trim() ||
    request.headers.get("x-webhook-secret")?.trim() ||
    "";
  if (fromHeader) return fromHeader;

  const authorization = request.headers.get("authorization")?.trim() || "";
  if (authorization.toLowerCase().startsWith("bearer ")) {
    return authorization.slice("bearer ".length).trim();
  }
  return "";
}

export function assertThreeCxWebhookAuthorized(request: Request): Response | null {
  const expected = process.env.THREECX_CRM_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return Response.json(
      { ok: false, error: "THREECX_CRM_WEBHOOK_SECRET is not configured." },
      { status: 503 },
    );
  }
  const key = readThreeCxWebhookKey(request);
  if (!key || key !== expected) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  return null;
}

function rowPhone(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Lookup lead / contact / signed client by Israel-normalized phone. */
export async function lookupContactByPhone(phoneRaw: string): Promise<BarOzLookupContact | null> {
  if (!isSupabaseConfigured()) return null;
  const phoneKey = israelPhoneKey(phoneRaw);
  if (!phoneKey) return null;

  const supabase = getSupabaseAdminClient();

  const { data: contacts, error: contactsError } = await supabase
    .from("sales_contacts")
    .select("id, lead_id, full_name, email, mobile_phone, office_phone")
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (contactsError) throw new Error(contactsError.message);

  for (const row of contacts ?? []) {
    const mobile = rowPhone(row.mobile_phone);
    const office = rowPhone(row.office_phone);
    if (israelPhonesMatch(mobile, phoneRaw) || israelPhonesMatch(office, phoneRaw)) {
      const leadId = typeof row.lead_id === "string" && row.lead_id ? row.lead_id : String(row.id);
      return toLookupContact({
        id: leadId,
        fullName: String(row.full_name ?? "Unknown"),
        email: typeof row.email === "string" ? row.email : null,
        phone: mobile || office,
        business: office || null,
        mobile2: mobile && office && !israelPhonesMatch(mobile, office) ? office : null,
        contactUrl: contactUrlForLead(leadId),
      });
    }
  }

  const { data: leads, error: leadsError } = await supabase
    .from("sales_leads")
    .select("id, full_name, company_name, email, phone")
    .not("phone", "is", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (leadsError) throw new Error(leadsError.message);

  for (const row of leads ?? []) {
    const phone = rowPhone(row.phone);
    if (israelPhonesMatch(phone, phoneRaw)) {
      return toLookupContact({
        id: String(row.id),
        fullName: String(row.full_name ?? "Unknown"),
        companyName: typeof row.company_name === "string" ? row.company_name : null,
        email: typeof row.email === "string" ? row.email : null,
        phone,
        contactUrl: contactUrlForLead(String(row.id)),
      });
    }
  }

  const { data: clients, error: clientsError } = await supabase
    .from("sales_clients")
    .select("id, lead_id, full_name, company_name, email, phone")
    .not("phone", "is", null)
    .order("updated_at", { ascending: false })
    .limit(2000);
  if (clientsError) throw new Error(clientsError.message);

  for (const row of clients ?? []) {
    const phone = rowPhone(row.phone);
    if (israelPhonesMatch(phone, phoneRaw)) {
      return toLookupContact({
        id: String(row.id),
        fullName: String(row.full_name ?? "Unknown"),
        companyName: typeof row.company_name === "string" ? row.company_name : null,
        email: typeof row.email === "string" ? row.email : null,
        phone,
        contactUrl: contactUrlForClient(String(row.id)),
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
}): Promise<BarOzCreateContact> {
  const phone = input.phone.trim();
  if (!phone) throw new Error("Phone is required.");
  if (!israelPhoneKey(phone)) throw new Error("Phone is required.");
  const first = input.firstName.trim() || "Unknown";
  const last = input.lastName?.trim() || "";
  const fullName = [first, last].filter(Boolean).join(" ");

  const existing = await lookupContactByPhone(phone);
  if (existing) return toCreateContactResponse(existing, phone);

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

  return toCreateContactResponse(
    toLookupContact({
      id: lead.id,
      fullName: lead.fullName,
      companyName: lead.companyName,
      email: lead.email,
      phone: lead.phone,
      contactUrl: contactUrlForLead(lead.id),
    }),
    phone,
  );
}

export function readBarOzString(
  body: Record<string, unknown>,
  ...keys: string[]
): string | null {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

export async function parseBarOzRequestBody(
  request: Request,
): Promise<Record<string, unknown> | null> {
  const text = await request.text().catch(() => "");
  const fromQuery = (): Record<string, unknown> => {
    const url = new URL(request.url);
    const out: Record<string, unknown> = {};
    for (const [key, value] of url.searchParams.entries()) {
      if (key === "key") continue;
      out[key] = value;
    }
    return out;
  };

  const mergeQuery = (body: Record<string, unknown>): Record<string, unknown> => {
    const query = fromQuery();
    return { ...query, ...body };
  };

  if (!text.trim()) {
    const query = fromQuery();
    return Object.keys(query).length > 0 ? query : {};
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return mergeQuery({});
      return mergeQuery(parsed as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  const params = new URLSearchParams(text);
  const out: Record<string, unknown> = {};
  for (const [key, value] of params.entries()) {
    out[key] = value;
  }
  return mergeQuery(out);
}

export function lookupPhoneFromRequest(request: Request): string {
  const url = new URL(request.url);
  return (
    url.searchParams.get("Phone")?.trim() ||
    url.searchParams.get("phone")?.trim() ||
    url.searchParams.get("Number")?.trim() ||
    url.searchParams.get("number")?.trim() ||
    ""
  );
}
