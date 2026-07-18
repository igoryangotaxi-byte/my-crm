import { isSupabaseConfigured } from "@/lib/supabase";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { createPersonalTask, listPersonalTasks } from "@/lib/sales-operation/personal-space";
import {
  SALES_TASK_STATUSES,
  type CreatePersonalTaskInput,
  type SalesTaskStatus,
} from "@/lib/sales-operation/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const url = new URL(request.url);
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
    const tasks = await listPersonalTasks(
      { userId: auth.user.id, email: auth.user.email },
      statuses,
    );
    return Response.json({ ok: true, tasks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load tasks." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;
  if (!isSupabaseConfigured()) {
    return Response.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as CreatePersonalTaskInput | null;
  if (!body?.title?.trim()) {
    return Response.json({ ok: false, error: "title is required." }, { status: 400 });
  }

  try {
    const task = await createPersonalTask({ userId: auth.user.id, email: auth.user.email }, body);
    return Response.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create task." },
      { status: 500 },
    );
  }
}
