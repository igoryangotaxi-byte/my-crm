import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeDifferenceFlag,
  computeDistanceBucket,
  enrichComparisonRow,
  isNoPriceTrip,
} from "../lib/driver-price-comparison/calculated-fields";

describe("driver price comparison calculated fields", () => {
  it("computes difference flag thresholds", () => {
    assert.equal(computeDifferenceFlag(100, 100), "No difference");
    assert.equal(computeDifferenceFlag(100.4, 100), "No difference");
    assert.equal(computeDifferenceFlag(100.6, 100), "Driver price higher");
    assert.equal(computeDifferenceFlag(99, 100), "Mone price higher");
  });

  it("marks unsuccessful zero-distance trips as no price", () => {
    assert.equal(computeDifferenceFlag(0, 50, 0, 0), "No price");
    assert.equal(isNoPriceTrip(0, 0, 0), true);
    assert.equal(isNoPriceTrip(0, null, null), true);
    assert.equal(computeDifferenceFlag(0, 50, 5, 0), "Mone price higher");
  });

  it("computes distance buckets", () => {
    assert.equal(computeDistanceBucket(2.5), "0-3 km");
    assert.equal(computeDistanceBucket(4), "3-5 km");
    assert.equal(computeDistanceBucket(8), "5-10 km");
    assert.equal(computeDistanceBucket(15), "10-20 km");
    assert.equal(computeDistanceBucket(25), "20+ km");
  });

  it("enriches a comparison row", () => {
    const enriched = enrichComparisonRow({
      order_id: "abc",
      order_date: "2026-03-15T08:30:00.000Z",
      driver_price_with_vat: 120,
      actual_km: 12,
      actual_minutes: 25,
      mone_price: 110,
    });
    assert.ok(enriched);
    assert.equal(enriched.difference_nis, 10);
    assert.equal(enriched.difference_flag, "Driver price higher");
    assert.equal(enriched.distance_bucket, "10-20 km");
    assert.ok(enriched.hour >= 0 && enriched.hour <= 23);
  });
});
