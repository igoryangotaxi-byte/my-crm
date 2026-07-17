import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { listSalesTasksWithLead } from "@/lib/sales-operation/tasks";
import { SALES_TASK_STATUSES, type SalesTaskStatus } from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") === "all" ? "all" : "mine";
  const statusParam = url.searchParams.get("status") ?? "open";

  let statuses: SalesTaskStatus[];
  if (statusParam === "all") {
    statuses = [...SALES_TASK_STATUSES];
  } else if ((SALES_TASK_STATUSES as readonly string[]).includes(statusParam)) {
    statuses = [statusParam as SalesTaskStatus];
  } else {
    statuses = ["open"];
  }

  try {
    const tasks = await listSalesTasksWithLead({
      assignedToUserId: scope === "mine" ? auth.user.id : null,
      statuses,
    });
    return Response.json(
      { ok: true, tasks, scope },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load tasks." },
      { status: 500 },
    );
  }
}
