import { isSupabaseConfigured } from "@/lib/supabase";
import {
  createSalesLead,
  findSalesLeadByWpformsSubmissionId,
} from "@/lib/sales-operation/repository";
import { isWpformsWebhookAuthorized, getWpformsWebhookSecret } from "@/lib/sales-operation/wpforms-webhook-auth";
import {
  mapWpformsPayloadToLeadInput,
  parseWpformsWebhookBody,
} from "@/lib/sales-operation/wpforms-webhook-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WP_FORMS_ACTOR = { userId: null, name: "WordPress / WPForms" };

export async function POST(request: Request) {
  if (!getWpformsWebhookSecret()) {
    return Response.json(
      { ok: false, error: "WPForms webhook is not configured on the server." },
      { status: 503 },
    );
  }

  if (!isWpformsWebhookAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = await parseWpformsWebhookBody(request);
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return Response.json({ ok: false, error: "Request body is required." }, { status: 400 });
  }

  try {
    const { input, submissionId } = mapWpformsPayloadToLeadInput(body);

    if (submissionId) {
      const existing = await findSalesLeadByWpformsSubmissionId(submissionId);
      if (existing) {
        return Response.json(
          { ok: true, lead: existing, duplicate: true },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    const lead = await createSalesLead(input, WP_FORMS_ACTOR);
    return Response.json({ ok: true, lead, duplicate: false }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create lead from WPForms.";
    const status = message.includes("fullName is required") ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
