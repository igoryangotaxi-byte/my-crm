import { createRequestRide, resolveRequestRideUserIdByPhone } from "@/lib/yango-api";
import { searchAddressSuggestions } from "@/lib/geocoding";
import { requireApprovedUser } from "@/lib/server-auth";
import type { RequestRidePayload } from "@/types/crm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizeString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function toFiniteNumber(input: unknown): number | null {
  if (typeof input === "number" && Number.isFinite(input)) return input;
  if (typeof input === "string" && input.trim()) {
    const value = Number(input.trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

type WaypointPayload = { address: string; lat?: number; lon?: number };

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  const rows = await searchAddressSuggestions({ query: address, language: "en", limit: 1 });
  const first = rows[0];
  if (!first) return null;
  return { lat: first.lat, lon: first.lon };
}

export async function POST(request: Request) {
  const auth = await requireApprovedUser(request);
  if (!auth.ok) return auth.response;
  const body = (await request.json().catch(() => null)) as Partial<RequestRidePayload> | null;
  const payload: RequestRidePayload = {
    tokenLabel: normalizeString(body?.tokenLabel),
    clientId: normalizeString(body?.clientId),
    rideClass: normalizeString(body?.rideClass) || "comfortplus_b2b",
    userId: undefined,
    sourceAddress: normalizeString(body?.sourceAddress),
    destinationAddress: normalizeString(body?.destinationAddress),
    sourceLat: toFiniteNumber(body?.sourceLat) ?? undefined,
    sourceLon: toFiniteNumber(body?.sourceLon) ?? undefined,
    destinationLat: toFiniteNumber(body?.destinationLat) ?? undefined,
    destinationLon: toFiniteNumber(body?.destinationLon) ?? undefined,
    phoneNumber: normalizeString(body?.phoneNumber),
    comment: normalizeString(body?.comment) || null,
    scheduleAtIso: normalizeString(body?.scheduleAtIso) || null,
    waypoints: Array.isArray(body?.waypoints)
      ? body.waypoints.reduce<WaypointPayload[]>((acc, item) => {
          if (!item || typeof item !== "object") return acc;
          const row = item as { address?: unknown; lat?: unknown; lon?: unknown };
          const address = normalizeString(row.address);
          if (!address) return acc;
          acc.push({
            address,
            lat: toFiniteNumber(row.lat) ?? undefined,
            lon: toFiniteNumber(row.lon) ?? undefined,
          });
          return acc;
        }, [])
      : [],
  };

  if (!payload.tokenLabel || !payload.clientId) {
    return Response.json(
      { ok: false, error: "tokenLabel and clientId are required." },
      { status: 400 },
    );
  }
  if (!payload.sourceAddress || !payload.destinationAddress) {
    return Response.json(
      { ok: false, error: "sourceAddress and destinationAddress are required." },
      { status: 400 },
    );
  }
  if (!payload.phoneNumber) {
    return Response.json(
      { ok: false, error: "phoneNumber is required." },
      { status: 400 },
    );
  }
  const resolvedUserId = await resolveRequestRideUserIdByPhone({
    tokenLabel: payload.tokenLabel,
    clientId: payload.clientId,
    phoneNumber: payload.phoneNumber,
  });
  if (!resolvedUserId) {
    return Response.json(
      {
        ok: false,
        error:
          "Phone is not mapped to user_id. Ensure employee exists in client cabinet and update phone->user_id mapping file.",
      },
      { status: 400 },
    );
  }
  payload.userId = resolvedUserId;
  if (payload.sourceLat == null || payload.sourceLon == null) {
    const src = await geocodeAddress(payload.sourceAddress);
    if (src) {
      payload.sourceLat = src.lat;
      payload.sourceLon = src.lon;
    }
  }
  if (payload.destinationLat == null || payload.destinationLon == null) {
    const dst = await geocodeAddress(payload.destinationAddress);
    if (dst) {
      payload.destinationLat = dst.lat;
      payload.destinationLon = dst.lon;
    }
  }
  if (
    payload.sourceLat == null ||
    payload.sourceLon == null ||
    payload.destinationLat == null ||
    payload.destinationLon == null
  ) {
    return Response.json(
      { ok: false, error: "Could not resolve route geopoints from addresses." },
      { status: 400 },
    );
  }
  if (payload.waypoints?.length) {
    for (const waypoint of payload.waypoints) {
      if (waypoint.lat == null || waypoint.lon == null) {
        const geo = await geocodeAddress(waypoint.address);
        if (geo) {
          waypoint.lat = geo.lat;
          waypoint.lon = geo.lon;
        }
      }
      if (waypoint.lat == null || waypoint.lon == null) {
        return Response.json(
          { ok: false, error: `Could not resolve geopoint for stop: ${waypoint.address}` },
          { status: 400 },
        );
      }
    }
  }

  try {
    const result = await createRequestRide(payload);
    return Response.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create ride.";
    const userHint = message.includes("User not found")
      ? " User not found in selected client context. Verify phone->user_id mapping and client context."
      : "";
    return Response.json(
      {
        ok: false,
        error: `${message}${userHint}`,
      },
      { status: 500 },
    );
  }
}
