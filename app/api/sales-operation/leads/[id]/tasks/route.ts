import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createSalesTask, listSalesTasks } from "@/lib/sales-operation/tasks";
import type { CreateSalesTaskInput } from "@/lib/sales-operation/types";

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
    const tasks = await listSalesTasks(id);
    return Response.json({ ok: true, tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load tasks." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as CreateSalesTaskInput | null;
  if (!body?.title?.trim()) {
    return Response.json({ ok: false, error: "title is required." }, { status: 400 });
  }

  try {
    const task = await createSalesTask(id, body, { userId: auth.user.id, name: auth.user.name });
    return Response.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create task.";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}
