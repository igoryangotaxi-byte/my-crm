import { listGettOrdersByPeriod } from "@/lib/gett-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(input: string | null): Date | null {
  if (!input) return null;
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const from = parseDate(searchParams.get("from")) ?? new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);
  const to = parseDate(searchParams.get("to")) ?? new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
  if (from > to) {
    return Response.json({ ok: false, error: "`from` must be <= `to`." }, { status: 400 });
  }
  try {
    const rows = await listGettOrdersByPeriod({ fromIso: from.toISOString(), toIso: to.toISOString() });
    const total = rows.length;
    const completed = rows.filter((row) => row.status.toLowerCase() === "completed").length;
    const cancelled = rows.filter((row) => row.status.toLowerCase() === "cancelled").length;
    const preOrders = rows.filter((row) => {
      if (!row.scheduledAt) return false;
      const due = new Date(row.scheduledAt);
      return !Number.isNaN(due.getTime()) && due.getTime() > Date.now();
    }).length;
    return Response.json(
      {
        ok: true,
        rows,
        summary: { total, completed, cancelled, preOrders },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch Gett orders by period." },
      { status: 500 },
    );
  }
}
