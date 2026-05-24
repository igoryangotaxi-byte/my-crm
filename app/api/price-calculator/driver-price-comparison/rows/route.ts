import { isSupabaseConfigured } from "@/lib/supabase";
import { requireApprovedUser } from "@/lib/server-auth";
import { fetchComparisonRowsPage } from "@/lib/driver-price-comparison/repository";
import type { ComparisonFilters } from "@/lib/driver-price-comparison/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as
    | (Partial<ComparisonFilters> & { page?: unknown; pageSize?: unknown })
    | null;
  const page = typeof body?.page === "number" ? body.page : Number(body?.page ?? 1);
  const pageSize =
    typeof body?.pageSize === "number" ? body.pageSize : Number(body?.pageSize ?? 50);

  try {
    const result = await fetchComparisonRowsPage({
      filters: body ?? {},
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    });
    return Response.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load comparison rows.",
      },
      { status: 500 },
    );
  }
}
