import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  isLeadDiscoveryEnabled,
  listEmailSequences,
  createEmailSequence,
} from "@/lib/sales-operation/lead-discovery/repository";
import {
  enrollLeadInSequence,
  approveEnrollment,
  stopEnrollment,
  processDueSequenceSends,
} from "@/lib/sales-operation/lead-discovery/sequences";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const sequences = await listEmailSequences();
  return Response.json({ ok: true, sequences });
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesLeadDiscovery");
  if (!auth.ok) return auth.response;
  if (!isLeadDiscoveryEnabled() || !isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Unavailable." }, { status: 403 });
  }
  const body = (await request.json().catch(() => null)) as {
    action?: string;
    name?: string;
    sequenceId?: string;
    leadId?: string;
    enrollmentId?: string;
    reason?: string;
  } | null;

  try {
    if (body?.action === "enroll" && body.sequenceId && body.leadId) {
      const enrollment = await enrollLeadInSequence(body.sequenceId, body.leadId);
      return Response.json({ ok: true, enrollment }, { status: 201 });
    }
    if (body?.action === "approve" && body.enrollmentId) {
      await approveEnrollment(body.enrollmentId);
      return Response.json({ ok: true });
    }
    if (body?.action === "stop" && body.enrollmentId) {
      await stopEnrollment(body.enrollmentId, body.reason ?? "manual");
      return Response.json({ ok: true });
    }
    if (body?.action === "process_due") {
      const result = await processDueSequenceSends({ userId: auth.user.id, name: auth.user.name });
      return Response.json({ ok: true, result });
    }
    if (!body?.name) return Response.json({ ok: false, error: "name required." }, { status: 400 });
    const sequence = await createEmailSequence({ name: body.name });
    return Response.json({ ok: true, sequence }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed." },
      { status: 500 },
    );
  }
}
