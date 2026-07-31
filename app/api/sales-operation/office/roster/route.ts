import { loadAuthStore } from "@/lib/auth-store";
import { getAssignableManagerUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Ops Floor team roster — assignable CRM managers (salesPipeline access).
 * Used for spatial agents / Team dock; not the single-manager analytics endpoint.
 */
export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesPipeline");
  if (!auth.ok) return auth.response;

  try {
    const store = await loadAuthStore();
    const managers = getAssignableManagerUserOptions(store.users).map((m) => ({
      id: m.id,
      userId: m.id,
      name: m.name,
      role: m.role,
    }));
    return Response.json({ ok: true, managers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to load roster." },
      { status: 500 },
    );
  }
}
