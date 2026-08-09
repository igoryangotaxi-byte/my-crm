import { googleGeocodeLatLon } from "@/lib/google-geocoding";
import { googleComputeRoute } from "@/lib/google-routes";
import type { PreOrder } from "@/types/crm";
import type { EnrichedPreOrderNode, RouteBundleSettings } from "@/lib/route-bundles/types";
import { resolvePreOrderEndpointCoords } from "@/lib/yango-api";

const geocodeCache = new Map<string, { lat: number; lon: number } | null>();

async function geocodeCached(address: string, apiKey: string): Promise<{ lat: number; lon: number } | null> {
  const key = address.trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;
  const hit = await googleGeocodeLatLon(address, apiKey, 4000);
  geocodeCache.set(key, hit);
  return hit;
}

export type EnrichResult = {
  nodes: EnrichedPreOrderNode[];
  skippedMissingCoords: number;
  skippedMissingSchedule: number;
  skippedAssigned: number;
  poolUnassigned: number;
};

/**
 * Enrich pre-orders with pickup/dropoff coords and service duration.
 * Prefers Yango order details coords, then existing Point A, then Google geocode.
 * Skips driver-assigned orders for unassigned-first MVP pools.
 */
export async function enrichPreOrdersForBundling(
  preOrders: PreOrder[],
  settings: RouteBundleSettings,
  options?: { includeAssigned?: boolean; apiKey?: string | null },
): Promise<EnrichResult> {
  const apiKey = options?.apiKey ?? process.env.GOOGLE_MAPS_API_KEY?.trim() ?? null;
  if (!apiKey) {
    throw new Error("GOOGLE_MAPS_API_KEY is required for Route Bundles.");
  }

  const now = Date.now();
  const horizonMs = 48 * 60 * 60 * 1000;
  let skippedAssigned = 0;
  const future = preOrders.filter((p) => {
    if (!p.scheduledAt) return false;
    const t = new Date(p.scheduledAt).getTime();
    return Number.isFinite(t) && t >= now && t <= now + horizonMs;
  });
  const poolUnassigned = future.filter((p) => !p.driverAssigned).length;

  const candidates = future
    .filter((p) => {
      if (!options?.includeAssigned && p.driverAssigned) {
        skippedAssigned += 1;
        return false;
      }
      return true;
    })
    .sort((a, b) => new Date(a.scheduledAt!).getTime() - new Date(b.scheduledAt!).getTime())
    .slice(0, settings.maxCandidateOrders);

  let skippedMissingCoords = 0;
  const skippedMissingSchedule = preOrders.length - future.length;
  const nodes: EnrichedPreOrderNode[] = [];

  for (const order of candidates) {
    const scheduledAt = new Date(order.scheduledAt!);
    const yango = await resolvePreOrderEndpointCoords(order);

    let pickupLat =
      yango?.pickupLat ??
      (typeof order.pointALat === "number" && Number.isFinite(order.pointALat) ? order.pointALat : null);
    let pickupLon =
      yango?.pickupLon ??
      (typeof order.pointALon === "number" && Number.isFinite(order.pointALon) ? order.pointALon : null);
    let dropLat = yango?.dropoffLat ?? null;
    let dropLon = yango?.dropoffLon ?? null;
    const pickupAddress = yango?.pickupAddress || order.pointA;
    const dropoffAddress = yango?.dropoffAddress || order.pointB;

    if (pickupLat == null || pickupLon == null) {
      const geo = await geocodeCached(pickupAddress, apiKey);
      pickupLat = geo?.lat ?? null;
      pickupLon = geo?.lon ?? null;
    }
    if (dropLat == null || dropLon == null) {
      const geo = await geocodeCached(dropoffAddress, apiKey);
      dropLat = geo?.lat ?? null;
      dropLon = geo?.lon ?? null;
    }

    if (
      pickupLat == null ||
      pickupLon == null ||
      dropLat == null ||
      dropLon == null ||
      !Number.isFinite(pickupLat) ||
      !Number.isFinite(pickupLon) ||
      !Number.isFinite(dropLat) ||
      !Number.isFinite(dropLon)
    ) {
      skippedMissingCoords += 1;
      continue;
    }

    const pickup = { lat: pickupLat, lon: pickupLon };
    const dropoff = { lat: dropLat, lon: dropLon };
    let serviceDurationSec = settings.serviceDurationFallbackMin * 60;
    let serviceDurationConfidence: "routed" | "estimated" = "estimated";
    try {
      const route = await googleComputeRoute([pickup, dropoff], apiKey, 12000);
      if (route.durationSeconds > 0) {
        serviceDurationSec = route.durationSeconds;
        serviceDurationConfidence = "routed";
      }
    } catch {
      // keep fallback
    }

    nodes.push({
      orderId: order.orderId,
      tokenLabel: order.tokenLabel,
      clientId: order.clientId,
      clientName: order.clientName,
      pickupAddress,
      dropoffAddress,
      pickup,
      dropoff,
      scheduledAt,
      serviceDurationSec,
      serviceDurationConfidence,
    });
  }

  return {
    nodes,
    skippedMissingCoords,
    skippedMissingSchedule,
    skippedAssigned,
    poolUnassigned,
  };
}
