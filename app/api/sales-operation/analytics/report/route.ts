import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { getSalesAnalyticsReport } from "@/lib/sales-operation/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAnalytics");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const report = await getSalesAnalyticsReport();
    return Response.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load report." },
      { status: 500 },
    );
  }
}
