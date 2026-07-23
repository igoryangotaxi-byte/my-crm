import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { canTracker, trackerForbiddenResponse } from "@/lib/sales-operation/tracker-permissions";
import {
  archiveTrackerTicket,
  deleteTrackerTicket,
  getTrackerTicket,
  updateTrackerTicket,
} from "@/lib/sales-operation/tracker";
import type { TrackerPriority } from "@/lib/sales-operation/tracker-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ ticketId: string }> };

export async function GET(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const ticket = await getTrackerTicket(ticketId);
    if (!ticket) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    return Response.json({ ok: true, ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load ticket." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string | null;
      priority?: TrackerPriority;
      dueAt?: string | null;
      parentTicketId?: string | null;
      statusId?: string;
      archived?: boolean;
    };
    if (body.archived !== undefined) {
      if (!canTracker("archiveTickets", auth.user.role)) {
        return trackerForbiddenResponse("archiveTickets");
      }
      const ticket = await archiveTrackerTicket(
        ticketId,
        { userId: auth.user.id, name: auth.user.name },
        body.archived,
      );
      return Response.json({ ok: true, ticket });
    }
    const ticket = await updateTrackerTicket(
      ticketId,
      body,
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, ticket });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update ticket." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) return auth.response;
  if (!canTracker("deleteTickets", auth.user.role)) return trackerForbiddenResponse("deleteTickets");
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { ticketId } = await ctx.params;
  try {
    await deleteTrackerTicket(ticketId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to delete ticket." },
      { status: 500 },
    );
  }
}
