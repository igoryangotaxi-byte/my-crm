import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deleteSalesLead, getSalesLeadById, updateSalesLead } from "@/lib/sales-operation/repository";
import type { UpdateSalesLeadInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const lead = await getSalesLeadById(id);
    if (!lead) {
      return Response.json({ ok: false, error: "Lead not found." }, { status: 404 });
    }
    return Response.json({ ok: true, lead }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load lead." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    await deleteSalesLead(id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete lead.";
    const status = message.includes("not found")
      ? 404
      : message.includes("converted to a client")
        ? 409
        : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdateSalesLeadInput | null;
  if (!body || Object.keys(body).length === 0) {
    return Response.json({ ok: false, error: "No fields to update." }, { status: 400 });
  }

  try {
    const lead = await updateSalesLead(id, body, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, lead });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lead.";
    const status = message.includes("not found") ? 404 : message.includes("Invalid status") ? 400 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
