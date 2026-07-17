import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { getAmPortfolio } from "@/lib/sales-operation/portfolio-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesSignedClients");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  try {
    const { from: fromDate, to: toDate, groups } = await getAmPortfolio({ from, to });
    return Response.json(
      { ok: true, range: { from: fromDate, to: toDate }, groups },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load portfolio." },
      { status: 500 },
    );
  }
}
