import { isSupabaseConfigured } from "@/lib/supabase";
import {
  createDriverLead,
  findDriverLeadBySubmissionId,
} from "@/lib/drivers-pipeline/repository";
import {
  getDriversPipelineWebhookSecret,
  isDriversPipelineWebhookAuthorized,
} from "@/lib/drivers-pipeline/webhook-auth";
import {
  mapDriversWebhookPayloadToLeadInput,
  parseDriversWebhookBody,
} from "@/lib/drivers-pipeline/webhook-mapper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WP_ACTOR = { userId: null, name: "WordPress / Drivers form" };

export async function POST(request: Request) {
  if (!getDriversPipelineWebhookSecret()) {
    return Response.json(
      { ok: false, error: "Drivers pipeline webhook is not configured on the server." },
      { status: 503 },
    );
  }

  if (!isDriversPipelineWebhookAuthorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = await parseDriversWebhookBody(request);
  if (!body || typeof body !== "object" || Object.keys(body).length === 0) {
    return Response.json({ ok: false, error: "Request body is required." }, { status: 400 });
  }

  try {
    const { input, submissionId } = mapDriversWebhookPayloadToLeadInput(body);

    if (submissionId) {
      const existing = await findDriverLeadBySubmissionId(submissionId);
      if (existing) {
        return Response.json(
          { ok: true, lead: existing, duplicate: true },
          { status: 200, headers: { "Cache-Control": "no-store" } },
        );
      }
    }

    const lead = await createDriverLead(input, WP_ACTOR);
    // Elementor Form webhook action treats only HTTP 200 as success (201 fails the form UI).
    return Response.json(
      { ok: true, lead, duplicate: false },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create driver lead from webhook.";
    const status = message.includes("fullName is required") ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
