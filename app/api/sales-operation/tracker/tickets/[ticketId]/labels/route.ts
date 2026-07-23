import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { setTicketLabels } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const body = (await request.json()) as { labelIds?: string[] };
    await setTicketLabels(ticketId, body.labelIds ?? []);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update labels." },
      { status: 500 },
    );
  }
}
