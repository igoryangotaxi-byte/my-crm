import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { setSalesLeadArchived } from "@/lib/sales-operation/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

async function setArchived(request: Request, context: RouteContext, archived: boolean) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const lead = await setSalesLeadArchived(id, archived, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lead.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

/** Archive a lead. */
export function POST(request: Request, context: RouteContext) {
  return setArchived(request, context, true);
}

/** Restore an archived lead. */
export function DELETE(request: Request, context: RouteContext) {
  return setArchived(request, context, false);
}
