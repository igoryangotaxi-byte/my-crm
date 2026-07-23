import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import {
  addChecklistItem,
  deleteChecklistItem,
  updateChecklistItem,
} from "@/lib/sales-operation/tracker";

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
    const body = (await request.json()) as { title?: string };
    if (!body.title?.trim()) {
      return Response.json({ ok: false, error: "title is required." }, { status: 400 });
    }
    const item = await addChecklistItem(ticketId, body.title, {
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, item }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to add checklist item." },
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
  await ctx.params;
  try {
    const body = (await request.json()) as {
      itemId?: string;
      title?: string;
      done?: boolean;
      position?: number;
      delete?: boolean;
    };
    if (!body.itemId) {
      return Response.json({ ok: false, error: "itemId is required." }, { status: 400 });
    }
    if (body.delete) {
      await deleteChecklistItem(body.itemId);
      return Response.json({ ok: true });
    }
    const item = await updateChecklistItem(
      body.itemId,
      { title: body.title, done: body.done, position: body.position },
      { userId: auth.user.id, name: auth.user.name },
    );
    return Response.json({ ok: true, item });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to update checklist." },
      { status: 500 },
    );
  }
}
