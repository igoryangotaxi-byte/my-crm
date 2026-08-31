import {
  assertThreeCxWebhookAuthorized,
  createContactFromThreeCx,
  readBarOzString,
} from "@/lib/call-center/baroz-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bar Oz Create Contact Record — 3CX POST when agent adds a contact.
 */
export async function POST(request: Request) {
  const denied = assertThreeCxWebhookAuthorized(request);
  if (denied) return denied;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  const phone = readBarOzString(body, "Phone", "phone");
  const firstName = readBarOzString(body, "First_Name", "FirstName", "first_name") || "Unknown";
  if (!phone) {
    return Response.json({ ok: false, error: "Phone is required." }, { status: 400 });
  }

  try {
    const contact = await createContactFromThreeCx({
      firstName,
      lastName: readBarOzString(body, "Last_Name", "LastName", "last_name"),
      company: readBarOzString(body, "Company", "Company_Name", "company"),
      email: readBarOzString(body, "Email", "email"),
      phone,
    });
    return Response.json(contact, { status: 200 });
  } catch (error) {
    console.error("[3cx add-contact]", error);
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create contact." },
      { status: 500 },
    );
  }
}
