import { requireRouteBundlesAccess } from "@/lib/route-bundles/access";
import { getAllYangoPreOrders } from "@/lib/yango-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight pool stats for the Route Bundles sidebar (no Google calls). */
export async function GET(request: Request) {
  const auth = await requireRouteBundlesAccess(request);
  if (!auth.ok) return auth.response;
  try {
    const { preOrders } = await getAllYangoPreOrders();
    const now = Date.now();
    const horizonMs = 48 * 60 * 60 * 1000;
    const future = preOrders.filter((p) => {
      if (!p.scheduledAt) return false;
      const t = new Date(p.scheduledAt).getTime();
      return Number.isFinite(t) && t >= now && t <= now + horizonMs;
    });
    const unassigned = future.filter((p) => !p.driverAssigned);
    const withPickup = unassigned.filter(
      (p) =>
        typeof p.pointALat === "number" &&
        Number.isFinite(p.pointALat) &&
        typeof p.pointALon === "number" &&
        Number.isFinite(p.pointALon),
    );
    return Response.json(
      {
        ok: true,
        poolUnassigned: unassigned.length,
        withPickupCoords: withPickup.length,
        missingPickupCoords: unassigned.length - withPickup.length,
        googleConfigured: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Pool stats failed." },
      { status: 500 },
    );
  }
}
