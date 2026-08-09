import type { TravelResolver } from "@/lib/route-bundles/matrix-cache";
import { colorForSequence } from "@/lib/route-bundles/colors";
import { scoreBundlePath } from "@/lib/route-bundles/scorer";
import type {
  BundlePathLeg,
  BundleSnapshotPayload,
  EnrichedPreOrderNode,
  GeoJsonLineCollection,
  RouteBundleSettings,
  ScoredBundlePath,
  TimelineEntry,
  TravelLeg,
} from "@/lib/route-bundles/types";

export async function evaluateOrderSequence(
  nodesInOrder: EnrichedPreOrderNode[],
  settings: RouteBundleSettings,
  travel: TravelResolver,
): Promise<ScoredBundlePath> {
  if (nodesInOrder.length < 1) {
    throw new Error("At least one order is required.");
  }

  const passengerLegs: TravelLeg[] = [];
  const emptyLegs: BundlePathLeg[] = [];
  let lastDropoffAt = new Date(
    nodesInOrder[0].scheduledAt.getTime() + nodesInOrder[0].serviceDurationSec * 1000,
  );

  // First passenger leg
  try {
    const leg = await travel.getTravel(
      nodesInOrder[0].pickup,
      nodesInOrder[0].dropoff,
      nodesInOrder[0].scheduledAt,
    );
    passengerLegs.push(leg);
    lastDropoffAt = new Date(
      nodesInOrder[0].scheduledAt.getTime() + Math.max(leg.durationSec, nodesInOrder[0].serviceDurationSec) * 1000,
    );
  } catch {
    passengerLegs.push({
      durationSec: nodesInOrder[0].serviceDurationSec,
      distanceM: 0,
      trafficAware: false,
    });
  }

  for (let i = 1; i < nodesInOrder.length; i += 1) {
    const prev = nodesInOrder[i - 1];
    const next = nodesInOrder[i];
    const empty = await travel.getTravel(prev.dropoff, next.pickup, lastDropoffAt);
    const arrivalMs = lastDropoffAt.getTime() + empty.durationSec * 1000;
    const bufferBeforePickupSec = Math.round((next.scheduledAt.getTime() - arrivalMs) / 1000);
    emptyLegs.push({
      fromOrderId: prev.orderId,
      toOrderId: next.orderId,
      emptyDrive: empty,
      bufferBeforePickupSec,
      expectedArrivalAtPickup: new Date(arrivalMs),
    });

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
    passengerLegs.push(passenger);
    const serviceSec = Math.max(passenger.durationSec, next.serviceDurationSec);
    lastDropoffAt = new Date(next.scheduledAt.getTime() + serviceSec * 1000);
  }

  const metrics = scoreBundlePath({
    nodes: nodesInOrder,
    passengerLegs,
    emptyLegs,
    settings,
  });

  return {
    orderIds: nodesInOrder.map((n) => n.orderId),
    nodes: nodesInOrder,
    passengerLegs,
    emptyLegs,
    minBufferSec: metrics.minBufferSec,
    emptyDriveM: metrics.emptyDriveM,
    emptyDriveSec: metrics.emptyDriveSec,
    totalDistanceM: metrics.totalDistanceM,
    score: metrics.score,
    scoreBreakdown: metrics.breakdown,
    health: metrics.health,
    windowStart: nodesInOrder[0].scheduledAt,
    windowEnd: lastDropoffAt,
  };
}

export function buildSnapshotFromPath(path: ScoredBundlePath): BundleSnapshotPayload {
  const passengerFeatures: GeoJsonLineCollection["features"] = [];
  const emptyFeatures: GeoJsonLineCollection["features"] = [];
  const allCoords: Array<[number, number]> = [];

  path.nodes.forEach((node, idx) => {
    const leg = path.passengerLegs[idx];
    const coords =
      leg?.coordinates && leg.coordinates.length >= 2
        ? leg.coordinates
        : ([
            [node.pickup.lon, node.pickup.lat],
            [node.dropoff.lon, node.dropoff.lat],
          ] as Array<[number, number]>);
    passengerFeatures.push({
      type: "Feature",
      properties: {
        kind: "passenger",
        orderId: node.orderId,
        sequence: idx + 1,
        color: colorForSequence(idx + 1),
      },
      geometry: { type: "LineString", coordinates: coords },
    });
    allCoords.push(...coords);
  });

  path.emptyLegs.forEach((leg, emptyIdx) => {
    const coords =
      leg.emptyDrive.coordinates && leg.emptyDrive.coordinates.length >= 2
        ? leg.emptyDrive.coordinates
        : (() => {
            const from = path.nodes.find((n) => n.orderId === leg.fromOrderId)!;
            const to = path.nodes.find((n) => n.orderId === leg.toOrderId)!;
            return [
              [from.dropoff.lon, from.dropoff.lat],
              [to.pickup.lon, to.pickup.lat],
            ] as Array<[number, number]>;
          })();
    emptyFeatures.push({
      type: "Feature",
      properties: {
        kind: "empty",
        fromOrderId: leg.fromOrderId,
        toOrderId: leg.toOrderId,
        color: colorForSequence(emptyIdx + 1),
      },
      geometry: { type: "LineString", coordinates: coords },
    });
    allCoords.push(...coords);
  });

  const timeline: TimelineEntry[] = [];
  path.nodes.forEach((node, idx) => {
    const dropoffAt = new Date(
      node.scheduledAt.getTime() +
        Math.max(path.passengerLegs[idx]?.durationSec ?? 0, node.serviceDurationSec) * 1000,
    );
    timeline.push({
      kind: "pickup",
      at: node.scheduledAt.toISOString(),
      orderId: node.orderId,
      label: `Pickup #${node.orderId}`,
    });
    timeline.push({
      kind: "dropoff",
      at: dropoffAt.toISOString(),
      orderId: node.orderId,
      label: `Dropoff #${node.orderId}`,
    });
    const transfer = path.emptyLegs.find((l) => l.fromOrderId === node.orderId);
    if (transfer) {
      timeline.push({
        kind: "transfer",
        from: dropoffAt.toISOString(),
        to: path.nodes.find((n) => n.orderId === transfer.toOrderId)!.scheduledAt.toISOString(),
        driveSec: transfer.emptyDrive.durationSec,
        bufferSec: transfer.bufferBeforePickupSec,
        orderFromId: transfer.fromOrderId,
        orderToId: transfer.toOrderId,
      });
    }
  });

  return {
    passengerGeojson: { type: "FeatureCollection", features: passengerFeatures },
    emptyDriveGeojson: { type: "FeatureCollection", features: emptyFeatures },
    fullPolylineCoordinates: allCoords,
    googleMetadata: {
      emptyLegs: path.emptyLegs.map((l) => ({
        from: l.fromOrderId,
        to: l.toOrderId,
        durationSec: l.emptyDrive.durationSec,
        distanceM: l.emptyDrive.distanceM,
        trafficAware: l.emptyDrive.trafficAware,
        bufferSec: l.bufferBeforePickupSec,
      })),
      score: path.score,
      health: path.health,
    },
    timeline,
  };
}

export function nodesFromBundleItems(
  items: Array<{
    orderId: string;
    tokenLabel: string;
    clientId: string;
    clientName: string;
    pickupAddress: string;
    dropoffAddress: string;
    pickupLat: number;
    pickupLon: number;
    dropoffLat: number;
    dropoffLon: number;
    scheduledAt: string;
    serviceDurationSec: number;
    serviceDurationConfidence: string;
  }>,
): EnrichedPreOrderNode[] {
  return items
    .slice()
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .map((item) => ({
      orderId: item.orderId,
      tokenLabel: item.tokenLabel,
      clientId: item.clientId,
      clientName: item.clientName,
      pickupAddress: item.pickupAddress,
      dropoffAddress: item.dropoffAddress,
      pickup: { lat: item.pickupLat, lon: item.pickupLon },
      dropoff: { lat: item.dropoffLat, lon: item.dropoffLon },
      scheduledAt: new Date(item.scheduledAt),
      serviceDurationSec: item.serviceDurationSec,
      serviceDurationConfidence:
        item.serviceDurationConfidence === "routed" ? "routed" : "estimated",
    }));
}
