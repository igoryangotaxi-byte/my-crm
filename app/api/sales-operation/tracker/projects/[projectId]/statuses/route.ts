import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import {
  createTrackerStatus,
  listTrackerStatuses,
  reorderTrackerStatuses,
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
    const statuses = await listTrackerStatuses(projectId);
    return Response.json({ ok: true, statuses }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load statuses." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("editStatuses", auth.user.role)) return trackerForbiddenResponse("editStatuses");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { projectId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      name?: string;
      color?: string;
      wipLimit?: number | null;
      isDone?: boolean;
      orderedIds?: string[];
    };
    if (Array.isArray(body.orderedIds)) {
      const statuses = await reorderTrackerStatuses(projectId, body.orderedIds);
      return Response.json({ ok: true, statuses });
    }
    if (!body.name?.trim()) {
      return Response.json({ ok: false, error: "Name is required." }, { status: 400 });
    }
    const status = await createTrackerStatus(projectId, {
      name: body.name,
      color: body.color,
      wipLimit: body.wipLimit,
      isDone: body.isDone,
    });
    return Response.json({ ok: true, status }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update statuses." },
      { status: 500 },
    );
  }
}
