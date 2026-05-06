import { getGettQuote } from "@/lib/gett-api";
import { searchAddressSuggestions } from "@/lib/geocoding";
import { requireApprovedUser } from "@/lib/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  const rows = await searchAddressSuggestions({ query: address, language: "en", limit: 1 });
  const first = rows[0];
  if (!first) return null;
  return { lat: first.lat, lng: first.lon };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as
    | {
        originLat?: unknown;
        originLng?: unknown;
        destinationLat?: unknown;
        destinationLng?: unknown;
        originAddress?: unknown;
        destinationAddress?: unknown;
        waypoints?: Array<{ lat?: unknown; lng?: unknown; address?: unknown }>;
        scheduledAt?: unknown;
      }
    | null;
  let originLat = num(body?.originLat);
  let originLng = num(body?.originLng);
  let destinationLat = num(body?.destinationLat);
  let destinationLng = num(body?.destinationLng);
  const originAddress = str(body?.originAddress);
  const destinationAddress = str(body?.destinationAddress);
  const scheduledAt = str(body?.scheduledAt);

  if ((originLat == null || originLng == null) && originAddress) {
    const geo = await geocodeAddress(originAddress);
    if (geo) {
      originLat = geo.lat;
      originLng = geo.lng;
    }
  }
  if ((destinationLat == null || destinationLng == null) && destinationAddress) {
    const geo = await geocodeAddress(destinationAddress);
    if (geo) {
      destinationLat = geo.lat;
      destinationLng = geo.lng;
    }
  }
  if (originLat == null || originLng == null || destinationLat == null || destinationLng == null) {
    return Response.json({ ok: false, error: "origin/destination coordinates are required." }, { status: 400 });
  }
  const waypointsRaw = Array.isArray(body?.waypoints) ? body.waypoints : [];
  const waypoints: Array<{ lat: number; lng: number }> = [];
  for (const waypoint of waypointsRaw) {
    let lat = num(waypoint?.lat);
    let lng = num(waypoint?.lng);
    const address = str(waypoint?.address);
    if ((lat == null || lng == null) && address) {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    if (lat != null && lng != null) waypoints.push({ lat, lng });
  }
  try {
    const result = await getGettQuote({
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      waypoints,
      scheduledAt: scheduledAt || null,
    });
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch quote." },
      { status: 500 },
    );
  }
}
