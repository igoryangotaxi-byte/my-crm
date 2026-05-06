import { createGettOrder } from "@/lib/gett-api";
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
    | (Record<string, unknown> & {
        waypoints?: Array<{ address?: unknown; lat?: unknown; lng?: unknown }>;
      })
    | null;
  let payload = {
    productId: str(body?.productId),
    quoteId: str(body?.quoteId),
    userName: str(body?.userName),
    userPhone: str(body?.userPhone),
    originLat: num(body?.originLat),
    originLng: num(body?.originLng),
    originAddress: str(body?.originAddress),
    destinationLat: num(body?.destinationLat),
    destinationLng: num(body?.destinationLng),
    destinationAddress: str(body?.destinationAddress),
    scheduledAt: str(body?.scheduledAt) || null as string | null,
  };
  if ((payload.originLat == null || payload.originLng == null) && payload.originAddress) {
    const geo = await geocodeAddress(payload.originAddress);
    if (geo) {
      payload.originLat = geo.lat;
      payload.originLng = geo.lng;
    }
  }
  if ((payload.destinationLat == null || payload.destinationLng == null) && payload.destinationAddress) {
    const geo = await geocodeAddress(payload.destinationAddress);
    if (geo) {
      payload.destinationLat = geo.lat;
      payload.destinationLng = geo.lng;
    }
  }
  const waypointsRaw = Array.isArray(body?.waypoints) ? body.waypoints : [];
  const waypoints: Array<{ address: string; lat: number; lng: number }> = [];
  for (const row of waypointsRaw) {
    const address = str(row?.address);
    let lat = num(row?.lat);
    let lng = num(row?.lng);
    if ((lat == null || lng == null) && address) {
      const geo = await geocodeAddress(address);
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    if (address && lat != null && lng != null) {
      waypoints.push({ address, lat, lng });
    }
  }
  if (
    !payload.productId ||
    !payload.quoteId ||
    !payload.userName ||
    !payload.userPhone ||
    !payload.originAddress ||
    !payload.destinationAddress ||
    payload.originLat == null ||
    payload.originLng == null ||
    payload.destinationLat == null ||
    payload.destinationLng == null
  ) {
    return Response.json({ ok: false, error: "Missing required fields for Gett order creation." }, { status: 400 });
  }
  try {
    const result = await createGettOrder({
      productId: payload.productId,
      quoteId: payload.quoteId,
      userName: payload.userName,
      userPhone: payload.userPhone,
      originLat: payload.originLat,
      originLng: payload.originLng,
      originAddress: payload.originAddress,
      destinationLat: payload.destinationLat,
      destinationLng: payload.destinationLng,
      destinationAddress: payload.destinationAddress,
      waypoints,
      scheduledAt: payload.scheduledAt,
    });
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to create Gett order." },
      { status: 500 },
    );
  }
}
