import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { duplicateTrackerTicket } from "@/lib/sales-operation/tracker";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("createTickets", auth.user.role)) return trackerForbiddenResponse("createTickets");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const ticket = await duplicateTrackerTicket(ticketId, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, ticket }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to duplicate ticket." },
      { status: 500 },
    );
  }
}
