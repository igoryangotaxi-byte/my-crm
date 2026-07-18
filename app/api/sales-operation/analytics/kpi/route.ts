import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { getManagerKpiReport } from "@/lib/sales-operation/manager-kpi-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fmt(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: fmt(start), to: fmt(now) };
}

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesManagerAnalytics");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const fallback = defaultRange();
  const from = url.searchParams.get("from")?.trim() || fallback.from;
  const to = url.searchParams.get("to")?.trim() || fallback.to;
  const managerUserId = url.searchParams.get("managerUserId")?.trim() || null;

  try {
    const report = await getManagerKpiReport({ from, to, managerUserId });
    return Response.json({ ok: true, report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load KPI report." },
      { status: 500 },
    );
  }
}
