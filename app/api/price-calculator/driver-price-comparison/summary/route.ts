import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { buildComparisonSummary } from "@/lib/driver-price-comparison/repository";
import type { ComparisonFilters } from "@/lib/driver-price-comparison/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as Partial<ComparisonFilters> | null;
  try {
    const summary = await buildComparisonSummary(body ?? {});
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to build comparison summary.",
      },
      { status: 500 },
    );
  }
}
