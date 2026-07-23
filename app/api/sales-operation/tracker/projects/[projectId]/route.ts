import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import {
  deleteTrackerProject,
  getTrackerProject,
  updateTrackerProject,
} from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { projectId } = await ctx.params;
  try {
    const project = await getTrackerProject(projectId);
    if (!project) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    return Response.json({ ok: true, project }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load project." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("editBoard", auth.user.role)) return trackerForbiddenResponse("editBoard");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { projectId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string | null;
      archived?: boolean;
    };
    const project = await updateTrackerProject(projectId, {
      name: body.name,
      description: body.description,
      archivedAt:
        body.archived === undefined
          ? undefined
          : body.archived
            ? new Date().toISOString()
            : null,
    });
    return Response.json({ ok: true, project });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update project." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("editBoard", auth.user.role) || !canTracker("deleteTickets", auth.user.role)) {
    return trackerForbiddenResponse("editBoard");
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { projectId } = await ctx.params;
  try {
    await deleteTrackerProject(projectId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete project." },
      { status: 500 },
    );
  }
}
