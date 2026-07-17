import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createManualActivity, getLeadActivityFeed } from "@/lib/sales-operation/activity";
import { SALES_ACTIVITY_TYPES, type SalesActivityType } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  try {
    const activities = await getLeadActivityFeed(id);
    return Response.json({ ok: true, activities }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load activity." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    type?: string;
    title?: string;
    body?: string;
    occurredAt?: string;
  } | null;

  const type = (body?.type ?? "manual") as SalesActivityType;
  if (!(SALES_ACTIVITY_TYPES as readonly string[]).includes(type)) {
    return Response.json({ ok: false, error: "Invalid activity type." }, { status: 400 });
  }
  if (!body?.title?.trim() && !body?.body?.trim()) {
    return Response.json({ ok: false, error: "title or body is required." }, { status: 400 });
  }

  try {
    const activity = await createManualActivity({
      leadId: id,
      type,
      title: body?.title ?? null,
      body: body?.body ?? null,
      occurredAt: body?.occurredAt,
      actor: { userId: auth.user.id, name: auth.user.name },
    });
    return Response.json({ ok: true, activity }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to log activity." },
      { status: 500 },
    );
  }
}
