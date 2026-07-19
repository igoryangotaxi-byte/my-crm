import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  canAccessSalesTask,
  getSalesTaskById,
  listFollowUpChain,
  listTaskEvents,
  reassignSalesTask,
  updateSalesTask,
} from "@/lib/sales-operation/tasks";

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
    const task = await getSalesTaskById(id);
    if (!task) {
      return Response.json({ ok: false, error: "Task not found." }, { status: 404 });
    }
    if (
      !canAccessSalesTask(task, {
        id: auth.user.id,
        role: auth.user.role,
      })
    ) {
      return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }
    const [events, chain] = await Promise.all([listTaskEvents(id), listFollowUpChain(id)]);
    return Response.json(
      { ok: true, task, events, chain },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load task." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return Response.json({ ok: false, error: "Invalid body." }, { status: 400 });
  }

  try {
    const existing = await getSalesTaskById(id);
    if (!existing) {
      return Response.json({ ok: false, error: "Task not found." }, { status: 404 });
    }
    if (
      !canAccessSalesTask(existing, {
        id: auth.user.id,
        role: auth.user.role,
      })
    ) {
      return Response.json({ ok: false, error: "Forbidden." }, { status: 403 });
    }

    const actor = { userId: auth.user.id, name: auth.user.name };
    let task;
    if (body.reassign === true && typeof body.assignedToUserId === "string") {
      task = await reassignSalesTask(
        id,
        {
          assignedToUserId: body.assignedToUserId,
          assignedToName:
            typeof body.assignedToName === "string" ? body.assignedToName : null,
          dueAt: typeof body.dueAt === "string" || body.dueAt === null ? (body.dueAt as string | null) : undefined,
          comment: typeof body.comment === "string" ? body.comment : null,
        },
        actor,
      );
    } else {
      task = await updateSalesTask(
        id,
        {
          title: typeof body.title === "string" ? body.title : undefined,
          description:
            typeof body.description === "string" || body.description === null
              ? (body.description as string | null)
              : undefined,
          status:
            typeof body.status === "string"
              ? (body.status as "open" | "done" | "cancelled")
              : undefined,
          priority:
            typeof body.priority === "string"
              ? (body.priority as "low" | "normal" | "high")
              : undefined,
          dueAt:
            typeof body.dueAt === "string" || body.dueAt === null
              ? (body.dueAt as string | null)
              : undefined,
          taskType:
            typeof body.taskType === "string" || body.taskType === null
              ? (body.taskType as "call" | "email" | "meeting" | "whatsapp" | "todo" | "other" | null)
              : undefined,
          assignedToUserId:
            typeof body.assignedToUserId === "string" || body.assignedToUserId === null
              ? (body.assignedToUserId as string | null)
              : undefined,
          assignedToName:
            typeof body.assignedToName === "string" || body.assignedToName === null
              ? (body.assignedToName as string | null)
              : undefined,
          resultSummary:
            typeof body.resultSummary === "string" || body.resultSummary === null
              ? (body.resultSummary as string | null)
              : undefined,
        },
        actor,
      );
    }

    const events = await listTaskEvents(id);
    return Response.json({ ok: true, task, events });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update task." },
      { status: 500 },
    );
  }
}
