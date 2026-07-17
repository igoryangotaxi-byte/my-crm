import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { globalSearch } from "@/lib/sales-operation/search-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 50) : 20;

  if (query.length < 2) {
    return Response.json({ ok: true, results: [] }, { headers: { "Cache-Control": "no-store" } });
  }

  try {
    const results = await globalSearch(query, limit);
    return Response.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Search failed." },
      { status: 500 },
    );
  }
}
