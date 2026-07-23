import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import { setTicketAssignees } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("assignTickets", auth.user.role)) return trackerForbiddenResponse("assignTickets");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      assignees?: Array<{ userId: string; userName?: string | null }>;
    };
    const assignees = await setTicketAssignees(
      ticketId,
      body.assignees ?? [],
      { userId: auth.user.id, name: auth.user.name },
      { notify: true },
    );
    return Response.json({ ok: true, assignees });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update assignees." },
      { status: 500 },
    );
  }
}
