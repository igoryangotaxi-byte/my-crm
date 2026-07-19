import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { StageRequirementError } from "@/lib/sales-operation/status-transitions";
import {
  preflightStageTransition,
  transitionSalesLead,
  type TransitionInput,
} from "@/lib/sales-operation/stage-transition";
import { SALES_LEAD_STATUSES, type SalesLeadStatus } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as (TransitionInput & {
    preflightOnly?: boolean;
  }) | null;

  if (!body?.toStatus || !(SALES_LEAD_STATUSES as readonly string[]).includes(body.toStatus)) {
    return Response.json({ ok: false, error: "Valid toStatus is required." }, { status: 400 });
  }

  const input: TransitionInput = {
    toStatus: body.toStatus as SalesLeadStatus,
    fields: body.fields,
    accountManagerUserId: body.accountManagerUserId,
    accountManagerName: body.accountManagerName,
    followUpTask: body.followUpTask,
  };

  try {
    if (body.preflightOnly) {
      const result = await preflightStageTransition(id, input);
      return Response.json({
        ok: result.ok,
        missing: result.missing,
        lead: result.lead,
      });
    }

    const result = await transitionSalesLead(id, input, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, lead: result.lead });
  } catch (error) {
    if (error instanceof StageRequirementError) {
      return Response.json(
        {
          ok: false,
          code: "STAGE_REQUIREMENTS",
          error: error.message,
          missing: error.missing,
        },
        { status: 422 },
      );
    }
    const message = error instanceof Error ? error.message : "Failed to transition lead.";
    const status = message.includes("Invalid status") ? 400 : message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
