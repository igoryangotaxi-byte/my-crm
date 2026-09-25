import {
  buildDriverAnalyticsReport,
  buildDriverLicenseAnalyticsReport,
} from "@/lib/drivers-pipeline/analytics";
import { listDriverLeads } from "@/lib/drivers-pipeline/repository";
import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDayParam(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  return trimmed;
}

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesDriversPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  try {
    const url = new URL(request.url);
    const from = parseDayParam(url.searchParams.get("from"));
    const to = parseDayParam(url.searchParams.get("to"));
    const leads = await listDriverLeads();
    const range = { from, to };
    const report = buildDriverAnalyticsReport(leads, range);
    const license = buildDriverLicenseAnalyticsReport(leads, range);
    return Response.json(
      { ok: true, report, license },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load drivers analytics.",
      },
      { status: 500 },
    );
  }
}
