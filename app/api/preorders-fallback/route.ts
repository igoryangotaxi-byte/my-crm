import { getClientScope, requireApprovedUser } from "@/lib/server-auth";
import { runPreOrderFallbackSweep } from "@/lib/yango-api";
import type { PreOrder } from "@/types/crm";
import { loadAuthStore } from "@/lib/auth-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SweepPayload = {
  preOrders?: Array<
    Pick<
      PreOrder,
      | "id"
      | "tokenLabel"
      | "clientId"
      | "orderId"
      | "scheduledAt"
      | "scheduledFor"
      | "pointA"
      | "pointB"
      | "driverAssigned"
      | "driverId"
      | "driverPhone"
      | "orderStatus"
      | "clientName"
      | "requestedAt"
      | "clientPrice"
      | "driverFirstName"
      | "driverLastName"
    >
  >;
  thresholdMinutes?: number;
  force?: boolean;
};

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const scope = getClientScope(auth.user);
  const payload = (await request.json().catch(() => null)) as SweepPayload | null;
  const preOrders = Array.isArray(payload?.preOrders)
    ? payload.preOrders.map((item) => ({
        ...item,
        fallback: null,
      }))
    : undefined;

  const filteredPreOrders =
    scope && preOrders
      ? preOrders.filter(
          (item) => item.tokenLabel === scope.tokenLabel && item.clientId === scope.apiClientId,
        )
      : preOrders;

  const store = await loadAuthStore();
  const globalB2CSettings =
    scope || auth.user.accountType === "client"
      ? null
      : store.globalB2CSettings?.enabled && store.globalB2CSettings.token
        ? {
            token: store.globalB2CSettings.token,
            clientId: store.globalB2CSettings.clientId?.trim() || "",
            rideClass: store.globalB2CSettings.rideClass?.trim() || "comfortplus",
            createEndpoint: store.globalB2CSettings.createEndpoint?.trim() || null,
          }
        : null;

  const result = await runPreOrderFallbackSweep({
    preOrders: filteredPreOrders,
    scope: scope ? { tokenLabel: scope.tokenLabel, clientId: scope.apiClientId } : undefined,
    thresholdMinutes: payload?.thresholdMinutes,
    force: payload?.force,
    b2cSettingsOverride: globalB2CSettings,
  });

  return Response.json(
    {
      ok: true,
      changed: result.changed,
      checked: result.checked,
      results: result.results,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
