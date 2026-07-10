import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  deleteSalesAutomation,
  getSalesAutomationById,
  updateSalesAutomation,
} from "@/lib/sales-operation/automation/repository";
import type { AutomationGraph } from "@/lib/sales-operation/automation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesAutomation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const automation = await getSalesAutomationById(id);
    if (!automation) {
      return Response.json({ ok: false, error: "Automation not found." }, { status: 404 });
    }
    return Response.json({ ok: true, automation }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load automation." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesAutomation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        name?: unknown;
        enabled?: unknown;
        graph?: AutomationGraph;
      }
    | null;

  if (!body || Object.keys(body).length === 0) {
    return Response.json({ ok: false, error: "No fields to update." }, { status: 400 });
  }

  try {
    const automation = await updateSalesAutomation(id, {
      name: typeof body.name === "string" ? body.name : undefined,
      enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
      graph: body.graph,
    });
    return Response.json({ ok: true, automation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update automation.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesAutomation");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    await deleteSalesAutomation(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete automation." },
      { status: 500 },
    );
  }
}
