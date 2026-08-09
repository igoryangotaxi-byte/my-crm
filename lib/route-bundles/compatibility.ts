import { haversineDurationSec, haversineKm } from "@/lib/route-bundles/geo";
import type { EnrichedPreOrderNode, RouteBundleSettings } from "@/lib/route-bundles/types";

/** Cheap filter before Google travel calls. */
export function canPairCheaply(
  a: EnrichedPreOrderNode,
  b: EnrichedPreOrderNode,
  settings: RouteBundleSettings,
): boolean {
  if (a.tokenLabel !== b.tokenLabel) return false;
  if (b.scheduledAt.getTime() <= a.scheduledAt.getTime()) return false;

  const emptyKm = haversineKm(a.dropoff, b.pickup);
  // Allow longer empty legs when the time gap is large (driver has slack to reposition).
  const gapMin = (b.scheduledAt.getTime() - a.scheduledAt.getTime()) / 60000;
  const slackFactor = gapMin >= 120 ? 2.2 : gapMin >= 60 ? 1.7 : 1.3;
  if (emptyKm > settings.maxEmptyDriveKm * slackFactor) return false;

  const bufferSec = settings.minSafetyBufferMin * 60;
  const lowerBoundDropoff = a.scheduledAt.getTime() + a.serviceDurationSec * 1000;
  const emptySec = haversineDurationSec(a.dropoff, b.pickup);
  const earliestArrival = lowerBoundDropoff + emptySec * 1000;
  if (earliestArrival + bufferSec * 0.5 > b.scheduledAt.getTime()) return false;

  return true;
}

export function buildCheapAdjacency(
  nodes: EnrichedPreOrderNode[],
  settings: RouteBundleSettings,
): Map<string, string[]> {
  const byId = new Map(nodes.map((n) => [n.orderId, n]));
  const adj = new Map<string, string[]>();
  for (const a of nodes) {
    const next: string[] = [];
    for (const b of nodes) {
      if (a.orderId === b.orderId) continue;
      if (canPairCheaply(a, b, settings)) next.push(b.orderId);
    }
    adj.set(a.orderId, next);
  }
  // silence unused
  void byId;
  return adj;
}
