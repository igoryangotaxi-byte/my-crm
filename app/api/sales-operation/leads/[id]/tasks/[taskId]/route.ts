import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deleteSalesTask, updateSalesTask } from "@/lib/sales-operation/tasks";
import type { UpdateSalesTaskInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; taskId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { taskId } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdateSalesTaskInput | null;
  if (!body || typeof body !== "object") {
    return Response.json({ ok: false, error: "Invalid payload." }, { status: 400 });
  }

  try {
    const task = await updateSalesTask(taskId, body, { userId: auth.user.id, name: auth.user.name });
    return Response.json({ ok: true, task });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update task.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { taskId } = await context.params;
  try {
    await deleteSalesTask(taskId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete task." },
      { status: 500 },
    );
  }
}
