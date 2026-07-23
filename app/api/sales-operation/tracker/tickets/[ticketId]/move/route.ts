import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { moveTrackerTicket } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const body = (await request.json()) as { statusId?: string; position?: number };
    if (!body.statusId || typeof body.position !== "number") {
      return Response.json(
        { ok: false, error: "statusId and position are required." },
        { status: 400 },
      );
    }
    const ticket = await moveTrackerTicket(
      ticketId,
      { statusId: body.statusId, position: body.position },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, ticket });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to move ticket." },
      { status: 500 },
    );
  }
}
