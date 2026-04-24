import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRequestRideBody,
  normalizeRideLifecycleStatus,
} from "../lib/yango-api";

test("buildRequestRideBody maps fields and includes due_date when scheduled", () => {
  const body = buildRequestRideBody({
    tokenLabel: "TEST CABINET",
    clientId: "client-1",
    rideClass: "comfortplus_b2b",
    userId: "known-user-id",
    sourceAddress: "A",
    destinationAddress: "B",
    sourceLat: 32.0853,
    sourceLon: 34.7818,
    destinationLat: 32.0859,
    destinationLon: 34.8002,
    phoneNumber: "+972500000000",
    comment: "Call on arrival",
    scheduleAtIso: "2026-04-24T10:00:00.000Z",
  });

  assert.deepEqual(body, {
    user_id: "known-user-id",
    class: "comfortplus_b2b",
    source: { fullname: "A", geopoint: [34.7818, 32.0853] },
    destination: { fullname: "B", geopoint: [34.8002, 32.0859] },
    route: [
      { fullname: "A", geopoint: [34.7818, 32.0853] },
      { fullname: "B", geopoint: [34.8002, 32.0859] },
    ],
    phone: "+972500000000",
    comment: "Call on arrival",
    due_date: "2026-04-24T10:00:00.000Z",
  });
});

test("normalizeRideLifecycleStatus maps statuses to UI lifecycle values", () => {
  assert.equal(normalizeRideLifecycleStatus("searching_performer"), "searching");
  assert.equal(normalizeRideLifecycleStatus("performer_assigned"), "driver_assigned");
  assert.equal(normalizeRideLifecycleStatus("driver_arrived"), "pickup");
  assert.equal(normalizeRideLifecycleStatus("transporting"), "in_progress");
  assert.equal(normalizeRideLifecycleStatus("transporting_finished"), "completed");
  assert.equal(normalizeRideLifecycleStatus("cancelled_by_client"), "cancelled");
  assert.equal(normalizeRideLifecycleStatus("mystery_status"), "unknown");
});
