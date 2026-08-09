import { buildCheapAdjacency } from "@/lib/route-bundles/compatibility";
import {
  buildEmptyDriveWarmupPairs,
  type TravelResolver,
} from "@/lib/route-bundles/matrix-cache";
import { packExclusivePaths } from "@/lib/route-bundles/pack";
import { scoreBundlePath } from "@/lib/route-bundles/scorer";
import type {
  BundlePathLeg,
  EnrichedPreOrderNode,
  RouteBundleSettings,
  ScoredBundlePath,
  TravelLeg,
} from "@/lib/route-bundles/types";

const BEAM_WIDTH = 100;
const MAX_SUGGESTIONS = 40;

type PartialPath = {
  orderIds: string[];
  nodes: EnrichedPreOrderNode[];
  passengerLegs: TravelLeg[];
  emptyLegs: BundlePathLeg[];
  lastDropoffAt: Date;
};

async function tryExtend(
  path: PartialPath,
  next: EnrichedPreOrderNode,
  settings: RouteBundleSettings,
  travel: TravelResolver,
): Promise<PartialPath | null> {
  const prev = path.nodes[path.nodes.length - 1];
  const empty = await travel.getTravel(prev.dropoff, next.pickup, path.lastDropoffAt);
  const gapMin = (next.scheduledAt.getTime() - path.lastDropoffAt.getTime()) / 60000;
  const slackFactor = gapMin >= 120 ? 2.2 : gapMin >= 60 ? 1.7 : 1.0;
  if (empty.distanceM / 1000 > settings.maxEmptyDriveKm * slackFactor) return null;

  const arrivalMs = path.lastDropoffAt.getTime() + empty.durationSec * 1000;
  const bufferBeforePickupSec = Math.round((next.scheduledAt.getTime() - arrivalMs) / 1000);
  const minBuffer = settings.minSafetyBufferMin * 60;
  if (bufferBeforePickupSec < minBuffer) return null;

  let passenger: TravelLeg;
  try {
    passenger = await travel.getTravel(next.pickup, next.dropoff, next.scheduledAt);
  } catch {
    passenger = {
      durationSec: next.serviceDurationSec,
      distanceM: 0,
      trafficAware: false,
    };
  }

  const serviceSec = passenger.durationSec > 0 ? passenger.durationSec : next.serviceDurationSec;
  const dropoffAt = new Date(
    next.scheduledAt.getTime() + Math.max(serviceSec, next.serviceDurationSec) * 1000,
  );

  return {
    orderIds: [...path.orderIds, next.orderId],
    nodes: [...path.nodes, { ...next, serviceDurationSec: serviceSec }],
    passengerLegs: [...path.passengerLegs, passenger],
    emptyLegs: [
      ...path.emptyLegs,
      {
        fromOrderId: prev.orderId,
        toOrderId: next.orderId,
        emptyDrive: empty,
        bufferBeforePickupSec,
        expectedArrivalAtPickup: new Date(arrivalMs),
      },
    ],
    lastDropoffAt: dropoffAt,
  };
}

function finalize(path: PartialPath, settings: RouteBundleSettings): ScoredBundlePath | null {
  if (path.nodes.length < 2) return null;
  const metrics = scoreBundlePath({
    nodes: path.nodes,
    passengerLegs: path.passengerLegs,
    emptyLegs: path.emptyLegs,
    settings,
  });
  if (metrics.health === "conflict") return null;
  return {
    orderIds: path.orderIds,
    nodes: path.nodes,
    passengerLegs: path.passengerLegs,
    emptyLegs: path.emptyLegs,
    minBufferSec: metrics.minBufferSec,
    emptyDriveM: metrics.emptyDriveM,
    emptyDriveSec: metrics.emptyDriveSec,
    totalDistanceM: metrics.totalDistanceM,
    score: metrics.score,
    scoreBreakdown: metrics.breakdown,
    health: metrics.health,
    windowStart: path.nodes[0].scheduledAt,
    windowEnd: path.lastDropoffAt,
  };
}

/**
 * Beam-search compatible chains of pre-orders (same token), length 2..maxOrders.
 */
export async function generateBundlePaths(
  nodes: EnrichedPreOrderNode[],
  settings: RouteBundleSettings,
  travel: TravelResolver,
): Promise<{ paths: ScoredBundlePath[]; warnings: string[] }> {
  const warnings: string[] = [];
  const adj = buildCheapAdjacency(nodes, settings);
  const byId = new Map(nodes.map((n) => [n.orderId, n]));

  try {
    const warmed = await travel.warmupEmptyDrives(buildEmptyDriveWarmupPairs(nodes, adj));
    if (warmed > 0) {
      warnings.push(`Preloaded ${warmed} empty-drive legs via Route Matrix.`);
    }
  } catch {
    // continue without warmup
  }

  type BeamItem = { path: PartialPath; scoreHint: number };
  let beam: BeamItem[] = nodes.map((n) => {
    const dropoffAt = new Date(n.scheduledAt.getTime() + n.serviceDurationSec * 1000);
    return {
      path: {
        orderIds: [n.orderId],
        nodes: [n],
        passengerLegs: [
          {
            durationSec: n.serviceDurationSec,
            distanceM: 0,
            trafficAware: false,
          },
        ],
        emptyLegs: [],
        lastDropoffAt: dropoffAt,
      },
      scoreHint: 0,
    };
  });

  const completed: ScoredBundlePath[] = [];

  for (let depth = 1; depth < settings.maxOrdersPerBundle; depth += 1) {
    const nextBeam: BeamItem[] = [];
    for (const item of beam) {
      if (travel.budgetExceeded()) {
        warnings.push("Google routing budget reached; returning partial suggestions.");
        break;
      }
      const candidates = adj.get(item.path.orderIds[item.path.orderIds.length - 1]) ?? [];
      for (const nextId of candidates) {
        if (item.path.orderIds.includes(nextId)) continue;
        const nextNode = byId.get(nextId);
        if (!nextNode) continue;
        try {
          const extended = await tryExtend(item.path, nextNode, settings, travel);
          if (!extended) continue;
          const scored = finalize(extended, settings);
          if (scored) {
            completed.push(scored);
            nextBeam.push({ path: extended, scoreHint: scored.score });
          } else {
            nextBeam.push({ path: extended, scoreHint: extended.orderIds.length * 50 });
          }
        } catch (error) {
          if (String(error).includes("budget")) {
            warnings.push("Google routing budget reached; returning partial suggestions.");
            break;
          }
        }
      }
      if (travel.budgetExceeded()) break;
    }
    nextBeam.sort((a, b) => b.scoreHint - a.scoreHint);
    beam = nextBeam.slice(0, BEAM_WIDTH);
    if (!beam.length) break;
  }

  const best = new Map<string, ScoredBundlePath>();
  for (const path of completed) {
    const key = path.orderIds.join(">");
    const prev = best.get(key);
    if (!prev || path.score > prev.score) best.set(key, path);
  }

  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const selected = packExclusivePaths(ranked, MAX_SUGGESTIONS);

  warnings.push(
    `Candidates ${nodes.length}; feasible chains ${ranked.length}; exclusive routes ${selected.length} (no shared orders).`,
  );

  return { paths: selected, warnings };
}
