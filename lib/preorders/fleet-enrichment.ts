import {
  getFleetDriverLookupIndexes,
  isFleetApiConfigured,
  lookupFleetDriverEnrichment,
  type FleetDriverLookupIndexes,
} from "@/lib/fleet-api";
import type { PreOrder } from "@/types/crm";

function hasRealDriverName(preOrder: PreOrder): boolean {
  const first = (preOrder.driverFirstName ?? "").trim();
  const last = (preOrder.driverLastName ?? "").trim();
  return Boolean(first || last);
}

/**
 * Fill gaps in B2B performer fields from Fleet park profiles (name / phone / car).
 * Does not overwrite already-present B2B values.
 */
export function applyFleetDriverEnrichment<T extends PreOrder>(
  preOrder: T,
  indexes: FleetDriverLookupIndexes,
): T {
  if (!preOrder.driverAssigned && !preOrder.driverId && !preOrder.driverPhone) {
    return preOrder;
  }

  const hit = lookupFleetDriverEnrichment(indexes, {
    driverId: preOrder.driverId,
    driverPhone: preOrder.driverPhone,
  });
  if (!hit) return preOrder;

  const next: T = { ...preOrder };
  if (!hasRealDriverName(next)) {
    next.driverFirstName = hit.driverFirstName;
    next.driverLastName = hit.driverLastName;
  }
  if (!next.driverPhone && hit.driverPhone) {
    next.driverPhone = hit.driverPhone;
  }
  if (!next.driverCarPlate && hit.driverCarPlate) {
    next.driverCarPlate = hit.driverCarPlate;
  }
  if (!next.driverCarModel && hit.driverCarModel) {
    next.driverCarModel = hit.driverCarModel;
  }
  if (!next.driverId && hit.driverId) {
    next.driverId = hit.driverId;
  }
  if (!next.driverAssigned && (hit.driverId || hit.driverPhone || hit.displayName)) {
    next.driverAssigned = true;
  }
  return next;
}

export async function enrichPreOrdersWithFleetDrivers<T extends PreOrder>(
  preOrders: T[],
): Promise<{ preOrders: T[]; fleetConfigured: boolean; fleetProfileCount: number }> {
  if (!isFleetApiConfigured()) {
    return { preOrders, fleetConfigured: false, fleetProfileCount: 0 };
  }

  try {
    const indexes = await getFleetDriverLookupIndexes();
    return {
      preOrders: preOrders.map((row) => applyFleetDriverEnrichment(row, indexes)),
      fleetConfigured: true,
      fleetProfileCount: indexes.profileCount,
    };
  } catch {
    return { preOrders, fleetConfigured: true, fleetProfileCount: 0 };
  }
}
