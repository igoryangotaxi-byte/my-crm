import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canPairCheaply } from "@/lib/route-bundles/compatibility";
import { haversineKm } from "@/lib/route-bundles/geo";
import { generateBundlePaths } from "@/lib/route-bundles/generator";
import { createMockTravelResolver } from "@/lib/route-bundles/matrix-cache";
import { computeHealth, scoreBundlePath } from "@/lib/route-bundles/scorer";
import { DEFAULT_ROUTE_BUNDLE_SETTINGS } from "@/lib/route-bundles/settings";
import type { EnrichedPreOrderNode } from "@/lib/route-bundles/types";

function node(
  partial: Partial<EnrichedPreOrderNode> & Pick<EnrichedPreOrderNode, "orderId" | "pickup" | "dropoff" | "scheduledAt">,
): EnrichedPreOrderNode {
  return {
    tokenLabel: "t1",
    clientId: "c1",
    clientName: "Client",
    pickupAddress: "A",
    dropoffAddress: "B",
    serviceDurationSec: 20 * 60,
    serviceDurationConfidence: "estimated",
    ...partial,
  };
}

describe("route-bundles geo", () => {
  it("computes haversine distance for nearby points", () => {
    const km = haversineKm({ lat: 32.08, lon: 34.78 }, { lat: 32.09, lon: 34.79 });
    assert.ok(km > 0 && km < 5);
  });
});

describe("route-bundles compatibility", () => {
  const settings = { ...DEFAULT_ROUTE_BUNDLE_SETTINGS, minSafetyBufferMin: 10, maxEmptyDriveKm: 25 };

  it("rejects reverse time order", () => {
    const a = node({
      orderId: "1",
      pickup: { lat: 32.08, lon: 34.78 },
      dropoff: { lat: 32.085, lon: 34.785 },
      scheduledAt: new Date("2030-01-01T10:00:00Z"),
    });
    const b = node({
      orderId: "2",
      pickup: { lat: 32.086, lon: 34.786 },
      dropoff: { lat: 32.09, lon: 34.79 },
      scheduledAt: new Date("2030-01-01T09:00:00Z"),
    });
    assert.equal(canPairCheaply(a, b, settings), false);
  });

  it("accepts compatible forward pair", () => {
    const a = node({
      orderId: "1",
      pickup: { lat: 32.08, lon: 34.78 },
      dropoff: { lat: 32.082, lon: 34.782 },
      scheduledAt: new Date("2030-01-01T10:00:00Z"),
      serviceDurationSec: 15 * 60,
    });
    const b = node({
      orderId: "2",
      pickup: { lat: 32.083, lon: 34.783 },
      dropoff: { lat: 32.09, lon: 34.79 },
      scheduledAt: new Date("2030-01-01T11:00:00Z"),
    });
    assert.equal(canPairCheaply(a, b, settings), true);
  });
});

describe("route-bundles scorer", () => {
  it("marks negative buffer as conflict", () => {
    assert.equal(computeHealth(-60, DEFAULT_ROUTE_BUNDLE_SETTINGS), "conflict");
    assert.equal(computeHealth(15 * 60, DEFAULT_ROUTE_BUNDLE_SETTINGS), "safe");
  });

  it("scores more orders higher", () => {
    const settings = DEFAULT_ROUTE_BUNDLE_SETTINGS;
    const baseNodes = [
      node({
        orderId: "1",
        pickup: { lat: 32.08, lon: 34.78 },
        dropoff: { lat: 32.082, lon: 34.782 },
        scheduledAt: new Date("2030-01-01T10:00:00Z"),
      }),
      node({
        orderId: "2",
        pickup: { lat: 32.083, lon: 34.783 },
        dropoff: { lat: 32.09, lon: 34.79 },
        scheduledAt: new Date("2030-01-01T11:00:00Z"),
      }),
    ];
    const two = scoreBundlePath({
      nodes: baseNodes,
      passengerLegs: [
        { durationSec: 900, distanceM: 3000, trafficAware: true },
        { durationSec: 900, distanceM: 3000, trafficAware: true },
      ],
      emptyLegs: [
        {
          fromOrderId: "1",
          toOrderId: "2",
          emptyDrive: { durationSec: 600, distanceM: 2000, trafficAware: true },
          bufferBeforePickupSec: 20 * 60,
          expectedArrivalAtPickup: new Date("2030-01-01T10:40:00Z"),
        },
      ],
      settings,
    });
    const threeNodes = [
      ...baseNodes,
      node({
        orderId: "3",
        pickup: { lat: 32.091, lon: 34.791 },
        dropoff: { lat: 32.1, lon: 34.8 },
        scheduledAt: new Date("2030-01-01T12:00:00Z"),
      }),
    ];
    const three = scoreBundlePath({
      nodes: threeNodes,
      passengerLegs: [
        { durationSec: 900, distanceM: 3000, trafficAware: true },
        { durationSec: 900, distanceM: 3000, trafficAware: true },
        { durationSec: 900, distanceM: 3000, trafficAware: true },
      ],
      emptyLegs: [
        {
          fromOrderId: "1",
          toOrderId: "2",
          emptyDrive: { durationSec: 600, distanceM: 2000, trafficAware: true },
          bufferBeforePickupSec: 20 * 60,
          expectedArrivalAtPickup: new Date("2030-01-01T10:40:00Z"),
        },
        {
          fromOrderId: "2",
          toOrderId: "3",
          emptyDrive: { durationSec: 600, distanceM: 2000, trafficAware: true },
          bufferBeforePickupSec: 20 * 60,
          expectedArrivalAtPickup: new Date("2030-01-01T11:40:00Z"),
        },
      ],
      settings,
    });
    assert.ok(three.score > two.score);
  });
});

describe("route-bundles generator", () => {
  it("builds a feasible 2+ chain with mock travel", async () => {
    const settings = {
      ...DEFAULT_ROUTE_BUNDLE_SETTINGS,
      maxOrdersPerBundle: 3,
      minSafetyBufferMin: 5,
      maxEmptyDriveKm: 40,
    };
    const nodes = [
      node({
        orderId: "a",
        pickup: { lat: 32.08, lon: 34.78 },
        dropoff: { lat: 32.085, lon: 34.785 },
        scheduledAt: new Date("2030-06-01T08:00:00Z"),
        serviceDurationSec: 10 * 60,
      }),
      node({
        orderId: "b",
        pickup: { lat: 32.086, lon: 34.786 },
        dropoff: { lat: 32.09, lon: 34.79 },
        scheduledAt: new Date("2030-06-01T08:40:00Z"),
        serviceDurationSec: 10 * 60,
      }),
      node({
        orderId: "c",
        pickup: { lat: 32.091, lon: 34.791 },
        dropoff: { lat: 32.1, lon: 34.8 },
        scheduledAt: new Date("2030-06-01T09:20:00Z"),
        serviceDurationSec: 10 * 60,
      }),
    ];
    const { paths } = await generateBundlePaths(nodes, settings, createMockTravelResolver(50));
    assert.ok(paths.length >= 1);
    assert.ok(paths[0].orderIds.length >= 2);
    assert.notEqual(paths[0].health, "conflict");
  });
});

describe("route-bundles exclusive pack", () => {
  it("prefers more short exclusive routes over one long chain", async () => {
    const { packExclusivePaths } = await import("@/lib/route-bundles/pack");
    const mk = (ids: string[], score: number) =>
      ({
        orderIds: ids,
        nodes: [],
        passengerLegs: [],
        emptyLegs: [],
        minBufferSec: 600,
        emptyDriveM: 1000,
        emptyDriveSec: 300,
        totalDistanceM: 5000,
        score,
        scoreBreakdown: {},
        health: "safe" as const,
        windowStart: new Date(),
        windowEnd: new Date(),
      });
    const packed = packExclusivePaths(
      [mk(["a", "b", "c", "d"], 400), mk(["a", "b"], 80), mk(["c", "d"], 80)],
      20,
    );
    assert.equal(packed.length, 2);
    assert.deepEqual(
      packed.map((p) => p.orderIds.join(">")).sort(),
      ["a>b", "c>d"],
    );
  });
});
