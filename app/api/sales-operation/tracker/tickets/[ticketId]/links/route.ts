import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { addTicketLink, deleteTicketLink } from "@/lib/sales-operation/tracker";
import type { TrackerLinkType } from "@/lib/sales-operation/tracker-types";

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
    const body = (await request.json()) as {
      toTicketId?: string;
      linkType?: TrackerLinkType;
      deleteLinkId?: string;
    };
    if (body.deleteLinkId) {
      await deleteTicketLink(body.deleteLinkId);
      return Response.json({ ok: true });
    }
    if (!body.toTicketId || !body.linkType) {
      return Response.json(
        { ok: false, error: "toTicketId and linkType are required." },
        { status: 400 },
      );
    }
    const link = await addTicketLink(ticketId, body.toTicketId, body.linkType, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, link }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update link." },
      { status: 500 },
    );
  }
}
