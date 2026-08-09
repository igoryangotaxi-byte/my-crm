import type { BundleHealth, BundlePathLeg, EnrichedPreOrderNode, TravelLeg } from "@/lib/route-bundles/types";
import type { RouteBundleSettings } from "@/lib/route-bundles/types";

export type PathMetricsInput = {
  nodes: EnrichedPreOrderNode[];
  passengerLegs: TravelLeg[];
  emptyLegs: BundlePathLeg[];
  settings: RouteBundleSettings;
};

export function computeHealth(minBufferSec: number, settings: RouteBundleSettings): BundleHealth {
  const target = settings.minSafetyBufferMin * 60;
  if (minBufferSec < 0) return "conflict";
  if (minBufferSec < target * 0.5) return "at_risk";
  if (minBufferSec < target) return "tight";
  return "safe";
}

export function scoreBundlePath(input: PathMetricsInput): {
  score: number;
  breakdown: Record<string, number>;
  health: BundleHealth;
  minBufferSec: number;
  emptyDriveM: number;
  emptyDriveSec: number;
  totalDistanceM: number;
} {
  const { nodes, passengerLegs, emptyLegs, settings } = input;
  const orderCount = nodes.length;
  const emptyDriveM = emptyLegs.reduce((s, l) => s + l.emptyDrive.distanceM, 0);
  const emptyDriveSec = emptyLegs.reduce((s, l) => s + l.emptyDrive.durationSec, 0);
  const passengerM = passengerLegs.reduce((s, l) => s + l.distanceM, 0);
  const totalDistanceM = emptyDriveM + passengerM;
  const buffers = emptyLegs.map((l) => l.bufferBeforePickupSec);
  const minBufferSec = buffers.length ? Math.min(...buffers) : settings.minSafetyBufferMin * 60;
  const health = computeHealth(minBufferSec, settings);

  const targetBuffer = settings.minSafetyBufferMin * 60;
  const ordersScore = orderCount * 100;
  const emptyKmPenalty = (emptyDriveM / 1000) * 8;
  const idleMinPenalty = (emptyDriveSec / 60) * 1.5;
  const bufferBonus = Math.min(targetBuffer, Math.max(0, minBufferSec)) / 60 * 6;
  const latePenalty =
    minBufferSec < 0 ? Math.abs(minBufferSec) / 60 * 40 : minBufferSec < targetBuffer ? (targetBuffer - minBufferSec) / 60 * 12 : 0;
  const avgEmptyKm = orderCount > 1 ? emptyDriveM / 1000 / (orderCount - 1) : 0;
  const continuityBonus = Math.max(0, 15 - avgEmptyKm);
  const estimatedPenalty = nodes.some((n) => n.serviceDurationConfidence === "estimated") ? 8 : 0;
  const noTrafficPenalty = emptyLegs.some((l) => !l.emptyDrive.trafficAware) ? 5 : 0;

  const breakdown = {
    ordersScore,
    emptyKmPenalty: -emptyKmPenalty,
    idleMinPenalty: -idleMinPenalty,
    bufferBonus,
    latePenalty: -latePenalty,
    continuityBonus,
    estimatedPenalty: -estimatedPenalty,
    noTrafficPenalty: -noTrafficPenalty,
  };
  const score =
    ordersScore -
    emptyKmPenalty -
    idleMinPenalty +
    bufferBonus -
    latePenalty +
    continuityBonus -
    estimatedPenalty -
    noTrafficPenalty;

  return {
    score,
    breakdown,
    health,
    minBufferSec,
    emptyDriveM,
    emptyDriveSec,
    totalDistanceM,
  };
}
