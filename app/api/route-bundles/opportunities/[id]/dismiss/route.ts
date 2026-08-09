import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { getOpportunity, setOpportunityStatus } from "@/lib/route-bundles/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  const { id } = await ctx.params;
  try {
    const opp = await getOpportunity(id);
    if (!opp) return Response.json({ ok: false, error: "Not found." }, { status: 404 });
    await setOpportunityStatus(id, "dismissed");
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Dismiss failed." },
      { status: 500 },
    );
  }
}
