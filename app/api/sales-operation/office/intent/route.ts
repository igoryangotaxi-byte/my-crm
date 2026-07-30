import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";
import { parseOfficeIntentHeuristic } from "@/lib/sales-operation/office/intent-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stub Office AI intent endpoint (Phase 4 roadmap).
 * Returns heuristic actions only — no separate agent DB; executors use existing CRM APIs.
 */
export async function POST(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => null)) as { text?: string; roomId?: string } | null;
  const result = parseOfficeIntentHeuristic(String(body?.text ?? ""));
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
