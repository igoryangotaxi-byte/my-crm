import type { TravelResolver } from "@/lib/route-bundles/matrix-cache";
import type { RouteBundle, ScoredBundlePath } from "@/lib/route-bundles/types";

/** Straight fallbacks use exactly 2 vertices; road polylines have more. */
export function isStubLineCoordinates(coords: Array<[number, number]> | undefined | null): boolean {
  return !coords || coords.length < 3;
}

export function snapshotNeedsRoadGeometry(bundle: RouteBundle): boolean {
  const passenger = bundle.latestSnapshot?.passengerGeojson?.features ?? [];
  if (!passenger.length) return true;
  const passengerStub = passenger.some((f) => isStubLineCoordinates(f.geometry?.coordinates));
  const empty = bundle.latestSnapshot?.emptyDriveGeojson?.features ?? [];
  const emptyStub = empty.some((f) => isStubLineCoordinates(f.geometry?.coordinates));
  return passengerStub || emptyStub;
}

/**
 * Fill missing Google road polylines on passenger / empty legs (keeps durations when present).
 */
export async function ensurePathPolylines(
  path: ScoredBundlePath,
  travel: TravelResolver,
): Promise<ScoredBundlePath> {
  const passengerLegs = [...path.passengerLegs];
  const emptyLegs = path.emptyLegs.map((leg) => ({
    ...leg,
    emptyDrive: { ...leg.emptyDrive },
  }));

  for (let i = 0; i < path.nodes.length; i += 1) {
    const node = path.nodes[i];
    if (!isStubLineCoordinates(passengerLegs[i]?.coordinates)) continue;
    try {
      passengerLegs[i] = await travel.getTravel(node.pickup, node.dropoff, node.scheduledAt);
    } catch {
      // keep stub / estimated leg
    }
  }

  let lastDropoffAt = new Date(
    path.nodes[0].scheduledAt.getTime() +
      Math.max(passengerLegs[0]?.durationSec ?? 0, path.nodes[0].serviceDurationSec) * 1000,
  );

  for (let i = 0; i < emptyLegs.length; i += 1) {
    const from = path.nodes[i];
    const to = path.nodes[i + 1];
    if (!to) break;

    if (isStubLineCoordinates(emptyLegs[i].emptyDrive.coordinates)) {
      try {
        const empty = await travel.getTravel(from.dropoff, to.pickup, lastDropoffAt);
        emptyLegs[i] = {
          ...emptyLegs[i],
          emptyDrive: empty,
        };
      } catch {
        // keep stub
      }
    }

    lastDropoffAt = new Date(
      to.scheduledAt.getTime() +
        Math.max(passengerLegs[i + 1]?.durationSec ?? 0, to.serviceDurationSec) * 1000,
    );
  }

  return { ...path, passengerLegs, emptyLegs };
}
