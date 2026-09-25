import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { transitionDriverLead } from "@/lib/drivers-pipeline/repository";
import {
  DRIVER_LEAD_STATUSES,
  type DriverLeadStatus,
} from "@/lib/drivers-pipeline/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesDriversPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    toStatus?: string;
    rejectedSubstatus?: string | null;
  } | null;

  if (!body?.toStatus || !(DRIVER_LEAD_STATUSES as readonly string[]).includes(body.toStatus)) {
    return Response.json({ ok: false, error: "Valid toStatus is required." }, { status: 400 });
  }

  try {
    const lead = await transitionDriverLead(
      id,
      body.toStatus as DriverLeadStatus,
      { userId: auth.user.id, name: auth.user.name },
      { rejectedSubstatus: body.rejectedSubstatus },
    );
    return Response.json({ ok: true, lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to transition lead.";
    const status = message.includes("not found")
      ? 404
      : message.includes("Invalid status")
        ? 400
        : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
