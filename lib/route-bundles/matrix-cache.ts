import {
  googleComputeRouteMatrixDirected,
  googleComputeRouteWithDeparture,
} from "@/lib/google-routes";
import { bucketDepartureIso, pointKey } from "@/lib/route-bundles/geo";
import type { EnrichedPreOrderNode, LatLon, TravelLeg } from "@/lib/route-bundles/types";

type CacheEntry = { leg: TravelLeg; expiresAt: number };

const cache = new Map<string, CacheEntry>();
const TTL_MS = 20 * 60_000;

export type TravelResolver = {
  getTravel: (from: LatLon, to: LatLon, departureAt: Date) => Promise<TravelLeg>;
  cellsUsed: () => number;
  budgetExceeded: () => boolean;
  /** Prefill empty-drive legs from a batched Route Matrix (no polylines). */
  warmupEmptyDrives: (
    pairs: Array<{ from: LatLon; to: LatLon; departureAt: Date }>,
  ) => Promise<number>;
};

function cacheKey(from: LatLon, to: LatLon, departureAt: Date, trafficAware: boolean) {
  return `${pointKey(from)}|${pointKey(to)}|${bucketDepartureIso(departureAt)}|${trafficAware ? "t" : "u"}`;
}

export function createTravelResolver(options: {
  apiKey: string;
  trafficAware: boolean;
  maxCells: number;
  timeoutMs?: number;
}): TravelResolver {
  let cells = 0;
  const timeoutMs = options.timeoutMs ?? 12000;

  return {
    cellsUsed: () => cells,
    budgetExceeded: () => cells >= options.maxCells,
    async warmupEmptyDrives(pairs) {
      const unique: Array<{ from: LatLon; to: LatLon; departureAt: Date; key: string }> = [];
      const seen = new Set<string>();
      for (const pair of pairs) {
        const key = cacheKey(pair.from, pair.to, pair.departureAt, options.trafficAware);
        if (seen.has(key)) continue;
        const hit = cache.get(key);
        if (hit && hit.expiresAt > Date.now()) continue;
        seen.add(key);
        unique.push({ ...pair, key });
      }
      if (!unique.length) return 0;

      // Chunk to keep matrix payloads reasonable (≤25×25).
      const CHUNK = 20;
      let warmed = 0;
      for (let i = 0; i < unique.length; i += CHUNK) {
        const batch = unique.slice(i, i + CHUNK);
        if (cells + batch.length > options.maxCells) break;
        const origins = batch.map((b) => b.from);
        const destinations = batch.map((b) => b.to);
        try {
          // Directed matrix is origins[i]→destinations[j]; we only need diagonal pairs,
          // so call one-origin batches when sets diverge. For identical-length pair lists
          // use NxN on unique points would waste cells — use per-pair origin/dest indices.
          const matrix = await googleComputeRouteMatrixDirected(
            origins,
            destinations,
            options.apiKey,
            timeoutMs,
          );
          cells += origins.length * destinations.length;
          for (let oi = 0; oi < batch.length; oi += 1) {
            const duration = matrix.durations[oi]?.[oi] ?? null;
            const distance = matrix.distances[oi]?.[oi] ?? null;
            if (duration == null || distance == null) continue;
            cache.set(batch[oi].key, {
              leg: {
                durationSec: duration,
                distanceM: distance,
                trafficAware: options.trafficAware,
              },
              expiresAt: Date.now() + TTL_MS,
            });
            warmed += 1;
          }
        } catch {
          // Fall through to per-leg computeRoutes on demand.
        }
      }
      return warmed;
    },
    async getTravel(from, to, departureAt) {
      const key = cacheKey(from, to, departureAt, options.trafficAware);
      const hit = cache.get(key);
      const hitFresh = hit && hit.expiresAt > Date.now() ? hit : null;
      if (hitFresh && (hitFresh.leg.coordinates?.length ?? 0) >= 3) {
        return hitFresh.leg;
      }
      if (cells >= options.maxCells) {
        if (hitFresh) return hitFresh.leg;
        throw new Error("Route matrix budget exceeded for this generate run.");
      }
      cells += 1;
      const route = await googleComputeRouteWithDeparture(
        [from, to],
        options.apiKey,
        timeoutMs,
        options.trafficAware ? departureAt : new Date(0),
      );
      // Keep matrix duration/distance when upgrading a duration-only cache hit (scoring consistency).
      const leg: TravelLeg = {
        durationSec: hitFresh?.leg.durationSec ?? route.durationSeconds,
        distanceM: hitFresh?.leg.distanceM ?? route.distanceMeters,
        trafficAware: options.trafficAware,
        coordinates: route.coordinates,
      };
      cache.set(key, { leg, expiresAt: Date.now() + TTL_MS });
      return leg;
    },
  };
}

/** Build candidate empty-drive pairs from cheap adjacency for matrix warmup. */
export function buildEmptyDriveWarmupPairs(
  nodes: EnrichedPreOrderNode[],
  adj: Map<string, string[]>,
): Array<{ from: LatLon; to: LatLon; departureAt: Date }> {
  const byId = new Map(nodes.map((n) => [n.orderId, n]));
  const pairs: Array<{ from: LatLon; to: LatLon; departureAt: Date }> = [];
  for (const a of nodes) {
    const nextIds = adj.get(a.orderId) ?? [];
    const dropoffAt = new Date(a.scheduledAt.getTime() + a.serviceDurationSec * 1000);
    for (const nextId of nextIds) {
      const b = byId.get(nextId);
      if (!b) continue;
      pairs.push({ from: a.dropoff, to: b.pickup, departureAt: dropoffAt });
    }
  }
  return pairs;
}

/** Test helper: deterministic haversine-based travel. */
export function createMockTravelResolver(avgKmh = 40): TravelResolver {
  let cells = 0;
  return {
    cellsUsed: () => cells,
    budgetExceeded: () => false,
    async warmupEmptyDrives() {
      return 0;
    },
    async getTravel(from, to) {
      cells += 1;
      const { haversineKm, haversineDurationSec } = await import("@/lib/route-bundles/geo");
      return {
        durationSec: haversineDurationSec(from, to, avgKmh),
        distanceM: Math.round(haversineKm(from, to) * 1000),
        trafficAware: false,
      };
    },
  };
}
