import {
  assertThreeCxWebhookAuthorized,
  lookupContactByPhone,
} from "@/lib/call-center/baroz-crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Bar Oz Lookup By Phone — 3CX GET when an inbound call arrives.
 * Miss → 200 with empty body (per PDF).
 */
export async function GET(request: Request) {
  const denied = assertThreeCxWebhookAuthorized(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const phone =
    url.searchParams.get("Phone")?.trim() ||
    url.searchParams.get("phone")?.trim() ||
    "";
  if (!phone) {
    return new Response(null, { status: 200 });
  }

  try {
    const contact = await lookupContactByPhone(phone);
    if (!contact) {
      return new Response(null, { status: 200 });
    }
    return Response.json(contact, { status: 200 });
  } catch (error) {
    console.error("[3cx lookup-by-phone]", error);
    return new Response(null, { status: 200 });
  }
}
