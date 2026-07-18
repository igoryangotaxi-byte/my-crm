import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { deletePersonalTask, updatePersonalTask } from "@/lib/sales-operation/personal-space";
import type { UpdatePersonalTaskInput } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as UpdatePersonalTaskInput | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  try {
    const task = await updatePersonalTask(
      { userId: auth.user.id, email: auth.user.email },
      id,
      body,
    );
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

  const { id } = await context.params;
  try {
    await deletePersonalTask({ userId: auth.user.id, email: auth.user.email }, id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete task." },
      { status: 500 },
    );
  }
}
