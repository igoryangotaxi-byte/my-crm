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
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
