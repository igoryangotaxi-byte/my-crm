import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  appendInterimDestination,
  destinationsToApiBody,
  formatChangeDestinationsCreatedTime,
  isTerminalOrderStatus,
  parseYangoOrderRoute,
  patchInterimDestination,
  toYangoRoutePoint,
} from "../lib/yango-change-destinations";

describe("yango change-destinations shaping", () => {
  it("parses source / interim / destination from orders/info shape", () => {
    const route = parseYangoOrderRoute("ord-1", {
      status: "scheduled",
      source: { fullname: "Start", geopoint: [34.78, 32.08] },
      interim_destinations: [{ fullname: "Stop A", geopoint: [34.79, 32.09] }],
      destination: { fullname: "End", geopoint: [34.8, 32.1] },
      performer: { fullname: "Driver", phone: "+972500000000" },
    });

    assert.equal(route.orderId, "ord-1");
    assert.equal(route.driverAssigned, true);
    assert.equal(route.source?.fullname, "Start");
    assert.equal(route.interimDestinations.length, 1);
    assert.equal(route.destination?.fullname, "End");
    assert.deepEqual(
      route.destinations.map((p) => p.fullname),
      ["Stop A", "End"],
    );
    assert.deepEqual(route.destinations[0]?.geopoint, [34.79, 32.09]);
  });

  it("reads nested info.source when top-level points are missing", () => {
    const route = parseYangoOrderRoute("ord-2", {
      info: {
        status: "pending",
        source: { fullname: "A", geopoint: [1, 2] },
        interim_destinations: [{ fullname: "B", geopoint: [3, 4] }],
        destination: { fullname: "C", geopoint: [5, 6] },
      },
    });
    assert.equal(route.driverAssigned, false);
    assert.deepEqual(
      destinationsToApiBody(route.destinations),
      [
        { fullname: "B", geopoint: [3, 4] },
        { fullname: "C", geopoint: [5, 6] },
      ],
    );
  });

  it("patches a single interim and keeps the final destination", () => {
    const route = parseYangoOrderRoute("ord-3", {
      source: { fullname: "Start", geopoint: [1, 1] },
      interim_destinations: [
        { fullname: "Old stop", geopoint: [2, 2] },
        { fullname: "Keep", geopoint: [3, 3] },
      ],
      destination: { fullname: "End", geopoint: [4, 4] },
    });

    const patched = patchInterimDestination(route, 0, {
      fullname: "New stop",
      lat: 32.5,
      lon: 34.5,
    });

    assert.deepEqual(
      patched.map((p) => ({ fullname: p.fullname, geopoint: p.geopoint })),
      [
        { fullname: "New stop", geopoint: [34.5, 32.5] },
        { fullname: "Keep", geopoint: [3, 3] },
        { fullname: "End", geopoint: [4, 4] },
      ],
    );
  });

  it("rejects out-of-range interimIndex", () => {
    const route = parseYangoOrderRoute("ord-4", {
      interim_destinations: [{ fullname: "Only", geopoint: [1, 2] }],
      destination: { fullname: "End", geopoint: [3, 4] },
    });
    assert.throws(() => patchInterimDestination(route, 1, { fullname: "X", lat: 1, lon: 2 }));
  });

  it("builds API body with [lon, lat] geopoints", () => {
    const point = toYangoRoutePoint("Place", 32.1, 34.2);
    assert.deepEqual(destinationsToApiBody([point]), [
      { fullname: "Place", geopoint: [34.2, 32.1] },
    ]);
  });

  it("formats created_time with timezone offset", () => {
    const formatted = formatChangeDestinationsCreatedTime(new Date("2026-08-31T17:00:00+03:00"));
    assert.match(formatted, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  });

  it("detects terminal statuses", () => {
    assert.equal(isTerminalOrderStatus("cancelled"), true);
    assert.equal(isTerminalOrderStatus("complete"), true);
    assert.equal(isTerminalOrderStatus("scheduled"), false);
    assert.equal(isTerminalOrderStatus("driving"), false);
  });

  it("appends a new interim before the final destination", () => {
    const route = parseYangoOrderRoute("ord-5", {
      source: { fullname: "Start", geopoint: [1, 1] },
      interim_destinations: [{ fullname: "Keep", geopoint: [2, 2] }],
      destination: { fullname: "End", geopoint: [3, 3] },
    });
    const next = appendInterimDestination(route, {
      fullname: "New stop",
      lat: 32.2,
      lon: 34.2,
    });
    assert.deepEqual(
      next.map((p) => p.fullname),
      ["Keep", "New stop", "End"],
    );
  });
});
