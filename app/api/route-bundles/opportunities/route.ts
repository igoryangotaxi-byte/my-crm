import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { listOpportunities } from "@/lib/route-bundles/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const opportunities = await listOpportunities("open");
    return Response.json({ ok: true, opportunities }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load opportunities." },
      { status: 500 },
    );
  }
}
