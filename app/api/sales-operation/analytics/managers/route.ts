import { getManagerPortfolioSummary } from "@/lib/sales-operation/manager-analytics";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesManagerAnalytics");
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const managerUserId = url.searchParams.get("managerUserId")?.trim() ?? "";
  const roleParam = url.searchParams.get("role")?.trim() ?? "account";
  const from = url.searchParams.get("from")?.trim() ?? "";
  const to = url.searchParams.get("to")?.trim() ?? "";

  if (!managerUserId || !from || !to) {
    return Response.json(
      { ok: false, error: "managerUserId, from, and to are required." },
      { status: 400 },
    );
  }
  if (roleParam !== "account" && roleParam !== "sales") {
    return Response.json({ ok: false, error: "role must be account or sales." }, { status: 400 });
  }

  try {
    const summary = await getManagerPortfolioSummary({
      managerUserId,
      role: roleParam,
      from,
      to,
    });
    return Response.json({ ok: true, summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load manager analytics." },
      { status: 500 },
    );
  }
}
