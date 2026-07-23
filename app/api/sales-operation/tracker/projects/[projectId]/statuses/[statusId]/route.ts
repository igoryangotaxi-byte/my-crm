import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import { deleteTrackerStatus, updateTrackerStatus } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string; statusId: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("editStatuses", auth.user.role)) return trackerForbiddenResponse("editStatuses");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { statusId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      name?: string;
      color?: string;
      wipLimit?: number | null;
      isDone?: boolean;
      position?: number;
    };
    const status = await updateTrackerStatus(statusId, body);
    return Response.json({ ok: true, status });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update status." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("editStatuses", auth.user.role)) return trackerForbiddenResponse("editStatuses");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { statusId } = await ctx.params;
  const url = new URL(request.url);
  const moveToStatusId = url.searchParams.get("moveToStatusId") ?? undefined;
  try {
    await deleteTrackerStatus(statusId, moveToStatusId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete status." },
      { status: 400 },
    );
  }
}
