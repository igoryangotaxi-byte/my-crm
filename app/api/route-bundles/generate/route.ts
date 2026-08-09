import { isSupabaseConfigured } from "@/lib/supabase";
import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { runBundleGeneration } from "@/lib/route-bundles/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }
  try {
    const result = await runBundleGeneration({
      userId: auth.user.id,
      name: auth.user.name,
    });
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Generate failed." },
      { status: 500 },
    );
  }
}
