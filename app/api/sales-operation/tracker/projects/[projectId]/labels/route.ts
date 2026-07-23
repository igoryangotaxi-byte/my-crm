import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import {
  createTrackerLabel,
  deleteTrackerLabel,
  listTrackerLabels,
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
    const labels = await listTrackerLabels(projectId);
    return Response.json({ ok: true, labels }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load labels." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, ctx: Ctx) {
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
      color?: string;
      deleteLabelId?: string;
    };
    if (body.deleteLabelId) {
      await deleteTrackerLabel(body.deleteLabelId);
      return Response.json({ ok: true });
    }
    if (!body.name?.trim()) {
      return Response.json({ ok: false, error: "name is required." }, { status: 400 });
    }
    const label = await createTrackerLabel(projectId, {
      name: body.name,
      color: body.color,
    });
    return Response.json({ ok: true, label }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update labels." },
      { status: 500 },
    );
  }
}
