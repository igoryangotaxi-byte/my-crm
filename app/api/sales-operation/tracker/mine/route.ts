import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listMyTrackerTickets } from "@/lib/sales-operation/tracker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesTracker");
  if (!auth.ok) {
    // My Space users with pipeline but without tracker page: still allow if they have pipeline
    const pipelineAuth = await requireSalesOperationPage(request, "salesPipeline");
    if (!pipelineAuth.ok) return pipelineAuth.response;
    if (!isSupabaseConfigured()) {
      return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
    }
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") === "created" ? "created" : "mine";
    const includeDone = url.searchParams.get("includeDone") === "1";
    try {
      const tickets = await listMyTrackerTickets({
        userId: pipelineAuth.user.id,
        scope,
        includeDone,
      });
      return Response.json({ ok: true, tickets }, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : "Failed to load tickets." },
        { status: 500 },
      );
    }
  }

  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "created" ? "created" : "mine";
  const includeDone = url.searchParams.get("includeDone") === "1";
  try {
    const tickets = await listMyTrackerTickets({
      userId: auth.user.id,
      scope,
      includeDone,
    });
    return Response.json({ ok: true, tickets }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load tickets." },
      { status: 500 },
    );
  }
}
