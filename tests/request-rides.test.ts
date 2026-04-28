import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRequestRideBody,
  extractDriverDetailsFromYangoShapes,
  normalizeRideLifecycleStatus,
} from "../lib/yango-api";
import { dedupePhones, isLikelyPhone, normalizePhone } from "../lib/phone-utils";
import { getClientScope } from "../lib/server-auth";

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

test("buildRequestRideBody includes stops between pickup and destination", () => {
  const body = buildRequestRideBody({
    tokenLabel: "TEST CABINET",
    clientId: "client-1",
    rideClass: "comfortplus_b2b",
    userId: "known-user-id",
    sourceAddress: "Pickup",
    destinationAddress: "Destination",
    sourceLat: 32.1,
    sourceLon: 34.8,
    destinationLat: 32.2,
    destinationLon: 34.9,
    waypoints: [
      { address: "Stop 1", lat: 32.15, lon: 34.85 },
      { address: "Stop 2", lat: 32.17, lon: 34.87 },
    ],
    phoneNumber: "+972500000001",
    comment: null,
    scheduleAtIso: null,
  });

  assert.deepEqual(body.route, [
    { fullname: "Pickup", geopoint: [34.8, 32.1] },
    { fullname: "Stop 1", geopoint: [34.85, 32.15] },
    { fullname: "Stop 2", geopoint: [34.87, 32.17] },
    { fullname: "Destination", geopoint: [34.9, 32.2] },
  ]);
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

test("extractDriverDetailsFromYangoShapes reads first/last name + vehicle from performer.vehicle", () => {
  const details = extractDriverDetailsFromYangoShapes(
    {
      first_name: "Yossi",
      last_name: "Cohen",
      vehicle: { brand: "Toyota", model: "Corolla", licence_plate: "12-345-67" },
    },
    null,
  );
  assert.equal(details.driverFirstName, "Yossi");
  assert.equal(details.driverLastName, "Cohen");
  assert.equal(details.carModel, "Toyota Corolla");
  assert.equal(details.carPlate, "12-345-67");
});

test("extractDriverDetailsFromYangoShapes splits fullname when first/last missing", () => {
  const details = extractDriverDetailsFromYangoShapes(
    { fullname: "John Michael Doe" },
    null,
  );
  assert.equal(details.driverFirstName, "John");
  assert.equal(details.driverLastName, "Michael Doe");
  assert.equal(details.driverName, "John Michael Doe");
});

test("extractDriverDetailsFromYangoShapes falls back to report fields and plates alias", () => {
  const details = extractDriverDetailsFromYangoShapes(
    { car: { plates: "AB-123-CD" } },
    {
      driver_first_name: "Ivan",
      driver_last_name: "Petrov",
      car_model: "Skoda Octavia",
    },
  );
  assert.equal(details.driverFirstName, "Ivan");
  assert.equal(details.driverLastName, "Petrov");
  assert.equal(details.carModel, "Skoda Octavia");
  assert.equal(details.carPlate, "AB-123-CD");
});

test("extractDriverDetailsFromYangoShapes returns nulls when payload empty", () => {
  const details = extractDriverDetailsFromYangoShapes(undefined, null);
  assert.equal(details.driverFirstName, null);
  assert.equal(details.driverLastName, null);
  assert.equal(details.carModel, null);
  assert.equal(details.carPlate, null);
});

test("normalizePhone strips Excel apostrophe and whitespace", () => {
  assert.equal(normalizePhone("'+972 50 123 4567"), "+972501234567");
  assert.equal(normalizePhone("  0501234567  "), "0501234567");
  assert.equal(normalizePhone(""), "");
  assert.equal(normalizePhone(null), "");
});

test("isLikelyPhone validates IL + international shapes", () => {
  assert.equal(isLikelyPhone("+972501234567"), true);
  assert.equal(isLikelyPhone("0501234567"), true);
  assert.equal(isLikelyPhone("12345"), false);
  assert.equal(isLikelyPhone(""), false);
});

test("dedupePhones normalizes, drops invalid, and keeps order", () => {
  const result = dedupePhones([
    "+972 50-123-4567",
    "+972501234567",
    " ",
    "0501112222",
    "0501112222",
    "abc",
  ]);
  assert.deepEqual(result, ["+972501234567", "0501112222"]);
});

test("getClientScope returns null for internal user and scope for client user", () => {
  assert.equal(
    getClientScope({
      id: "u1",
      name: "Internal",
      email: "internal@test.local",
      password: "",
      role: "Admin",
      status: "approved",
      createdAt: new Date().toISOString(),
      accountType: "internal",
    }),
    null,
  );

  assert.deepEqual(
    getClientScope({
      id: "u2",
      name: "Client",
      email: "client@test.local",
      password: "",
      role: "User",
      status: "approved",
      createdAt: new Date().toISOString(),
      accountType: "client",
      tenantId: "tenant-1",
      corpClientId: "corp-1",
      tokenLabel: "TOKEN",
      apiClientId: "client-1",
      clientRoleId: "employee",
    }),
    {
      tenantId: "tenant-1",
      corpClientId: "corp-1",
      tokenLabel: "TOKEN",
      apiClientId: "client-1",
      clientRoleId: "employee",
    },
  );
});
