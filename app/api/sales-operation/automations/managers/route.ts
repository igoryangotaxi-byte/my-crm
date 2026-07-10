import { loadAuthStore } from "@/lib/auth-store";
import { getAssignableManagerUserOptions } from "@/lib/sales-operation/crm-manager-users";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "salesAutomation");
  if (!auth.ok) return auth.response;

  try {
    const store = await loadAuthStore();
    const managers = getAssignableManagerUserOptions(store.users);
    return Response.json({ ok: true, managers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to list managers." },
      { status: 500 },
    );
  }
}
