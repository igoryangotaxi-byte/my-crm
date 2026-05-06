import test from "node:test";
import assert from "node:assert/strict";

import { normalizeAddressForGeocode } from "../lib/google-geocoding";

test("normalizeAddressForGeocode strips bidi marks", () => {
  assert.equal(
    normalizeAddressForGeocode("לאונרדו בוטיק תל אביב\u200e, רחוב\u200f"),
    "לאונרדו בוטיק תל אביב, רחוב",
  );
});
