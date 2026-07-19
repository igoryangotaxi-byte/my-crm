import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  canAccessSalesTask,
  createFollowUpTask,
  getSalesTaskById,
} from "@/lib/sales-operation/tasks";

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
  const body = (await request.json().catch(() => null)) as {
    title?: string;
    description?: string | null;
    dueAt?: string | null;
    assignedToUserId?: string | null;
    assignedToName?: string | null;
    priority?: "low" | "normal" | "high";
  } | null;

  try {
    const parent = await getSalesTaskById(id);
    if (!parent) {
      return Response.json({ ok: false, error: "Task not found." }, { status: 404 });
    }
    if (
      !canAccessSalesTask(parent, {
        id: auth.user.id,
        role: auth.user.role,
      })
    ) {
      return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const task = await createFollowUpTask(
      id,
      {
        title: body?.title?.trim() || `Follow-up: ${parent.title}`,
        description: body?.description ?? null,
        dueAt: body?.dueAt ?? null,
        assignedToUserId: body?.assignedToUserId ?? auth.user.id,
        assignedToName: body?.assignedToName ?? auth.user.name,
        priority: body?.priority ?? "normal",
        taskType: "todo",
      },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, task });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to create follow-up.",
      },
      { status: 500 },
    );
  }
}
