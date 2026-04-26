import { getDriversOnMapDataOptimized } from "@/lib/fleet-api";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const includeGeo = searchParams.get("includeGeo") === "1";
  const force = searchParams.get("force") === "1";
  const debug = searchParams.get("debug") === "1";
  const payload = await getDriversOnMapDataOptimized({ includeGeo, force, debug });
  if (payload.ok) {
    const drivers = payload.drivers ?? [];
    const withGeo = drivers.filter((driver) => driver.lat != null && driver.lon != null);
    const activeTrip = drivers.filter((driver) => driver.status === "active_trip");
    const activeTripWithGeo = activeTrip.filter((driver) => driver.lat != null && driver.lon != null);
    const shouldLog = debug || (includeGeo && withGeo.length === 0);
    if (shouldLog) {
      console.info(
        `[drivers-map] response includeGeo=${includeGeo ? "1" : "0"} force=${force ? "1" : "0"} total=${drivers.length} withGeo=${withGeo.length} activeTrip=${activeTrip.length} activeTripWithGeo=${activeTripWithGeo.length} source=${payload.source} msg=${payload.message ?? "-"}`,
      );
    }
  }
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
