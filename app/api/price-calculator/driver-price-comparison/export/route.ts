import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import {
  fetchComparisonExportRows,
  rowsToCsv,
} from "@/lib/driver-price-comparison/repository";
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
    const rows = await fetchComparisonExportRows(body ?? {});
    const csv = rowsToCsv(rows);
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="driver-price-comparison-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to export comparison rows.",
      },
      { status: 500 },
    );
  }
}
