import { isSupabaseConfigured } from "@/lib/supabase";
import { recordInboundEmail } from "@/lib/sales-operation/email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request): boolean {
  const secret = process.env.SALES_EMAIL_INBOUND_SECRET?.trim();
  if (!secret) return false;
  const headerSecret = request.headers.get("x-webhook-secret")?.trim();
  if (headerSecret && headerSecret === secret) return true;
  const authorization = request.headers.get("authorization")?.trim();
  return authorization === `Bearer ${secret}`;
}

/**
 * Inbound email webhook — an external parse/forward service posts received
 * emails here to attach them to a lead thread. Secured by SALES_EMAIL_INBOUND_SECRET.
 */
export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    leadId?: string;
    from?: string;
    to?: string;
    subject?: string;
    body?: string;
    occurredAt?: string;
  } | null;

  if (!body?.leadId?.trim() || !body.from?.trim()) {
    return Response.json({ ok: false, error: "leadId and from are required." }, { status: 400 });
  }

  try {
    const message = await recordInboundEmail({
      leadId: body.leadId.trim(),
      fromAddress: body.from.trim(),
      toAddress: body.to?.trim() || null,
      subject: body.subject?.trim() || "(no subject)",
      body: body.body ?? "",
      occurredAt: body.occurredAt,
    });
    return Response.json({ ok: true, message }, { status: 201 });
  } catch (error) {
    const messageText = error instanceof Error ? error.message : "Failed to record email.";
    const status = messageText.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: messageText }, { status });
  }
}
