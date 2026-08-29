import { loadAllYangoPreOrdersFresh } from "@/lib/yango-api";
import { enrichPreOrdersWithFleetDrivers } from "@/lib/preorders/fleet-enrichment";
import { getPreOrderOperatorMarksMap, markKey } from "@/lib/preorders/operator-marks";
import { requireSalesOperationPage } from "@/lib/sales-operation/require-sales-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireSalesOperationPage(request, "preOrders");
  if (!auth.ok) return auth.response;

  try {
    const [{ preOrders, errors }, marks] = await Promise.all([
      loadAllYangoPreOrdersFresh(),
      getPreOrderOperatorMarksMap(),
    ]);

    const now = Date.now();
    const futureOnly = preOrders.filter((row) => {
      if (!row.scheduledAt) return true;
      const due = new Date(row.scheduledAt).getTime();
      return Number.isFinite(due) ? due > now : true;
    });

    const { preOrders: enriched, fleetConfigured, fleetProfileCount } =
      await enrichPreOrdersWithFleetDrivers(futureOnly);

    const livePreOrders = enriched
      .map((row) => {
        const mark = marks.get(markKey(row));
        return {
          ...row,
          operatorContact: mark && mark.status !== "none" ? mark : null,
        };
      })
      .sort((a, b) => {
        const aTime = a.scheduledAt ? new Date(a.scheduledAt).getTime() : 0;
        const bTime = b.scheduledAt ? new Date(b.scheduledAt).getTime() : 0;
        return aTime - bTime;
      });

    return Response.json(
      {
        ok: true,
        preOrders: livePreOrders,
        errors,
        fetchedAt: new Date().toISOString(),
        fleet: {
          configured: fleetConfigured,
          profileCount: fleetProfileCount,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load live pre-orders.",
        preOrders: [],
        errors: [],
        fetchedAt: new Date().toISOString(),
      },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
