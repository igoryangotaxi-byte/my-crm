import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyFleetDriverEnrichment } from "@/lib/preorders/fleet-enrichment";
import type { FleetDriverLookupIndexes } from "@/lib/fleet-api";
import type { PreOrder } from "@/types/crm";

function basePreOrder(overrides: Partial<PreOrder> = {}): PreOrder {
  return {
    id: "t-1",
    tokenLabel: "demo",
    clientId: "c1",
    orderId: "o1",
    clientPrice: "0",
    clientName: "Client",
    requestedAt: "—",
    scheduledFor: "—",
    scheduledAt: "2026-08-27T15:00:00+03:00",
    pointA: "A",
    pointB: "B",
    driverAssigned: true,
    driverId: "driver-123",
    driverFirstName: null,
    driverLastName: null,
    driverPhone: null,
    driverCarModel: null,
    driverCarPlate: null,
    ...overrides,
  };
}

describe("fleet driver enrichment for pre-orders", () => {
  const indexes: FleetDriverLookupIndexes = {
    profileCount: 1,
    byId: new Map([
      [
        "driver-123",
        {
          driverId: "driver-123",
          driverFirstName: "Avi",
          driverLastName: "Cohen",
          driverPhone: "+972501112233",
          driverCarPlate: "12-345-67",
          driverCarModel: "Toyota Corolla",
          displayName: "Avi Cohen",
        },
      ],
    ]),
    byPhone: new Map([
      [
        "972501112233",
        {
          driverId: "driver-123",
          driverFirstName: "Avi",
          driverLastName: "Cohen",
          driverPhone: "+972501112233",
          driverCarPlate: "12-345-67",
          driverCarModel: "Toyota Corolla",
          displayName: "Avi Cohen",
        },
      ],
    ]),
  };

  it("fills missing name/phone/car from fleet by driver id", () => {
    const next = applyFleetDriverEnrichment(basePreOrder(), indexes);
    assert.equal(next.driverFirstName, "Avi");
    assert.equal(next.driverLastName, "Cohen");
    assert.equal(next.driverPhone, "+972501112233");
    assert.equal(next.driverCarPlate, "12-345-67");
    assert.equal(next.driverCarModel, "Toyota Corolla");
  });

  it("does not overwrite existing B2B performer fields", () => {
    const next = applyFleetDriverEnrichment(
      basePreOrder({
        driverFirstName: "From",
        driverLastName: "B2B",
        driverPhone: "+972509998887",
        driverCarPlate: "99-999-99",
      }),
      indexes,
    );
    assert.equal(next.driverFirstName, "From");
    assert.equal(next.driverLastName, "B2B");
    assert.equal(next.driverPhone, "+972509998887");
    assert.equal(next.driverCarPlate, "99-999-99");
    assert.equal(next.driverCarModel, "Toyota Corolla");
  });

  it("matches by phone when driver id is unknown", () => {
    const next = applyFleetDriverEnrichment(
      basePreOrder({
        driverId: "unknown-id",
        driverPhone: "050-111-2233",
      }),
      indexes,
    );
    assert.equal(next.driverFirstName, "Avi");
    assert.equal(next.driverLastName, "Cohen");
  });
});
