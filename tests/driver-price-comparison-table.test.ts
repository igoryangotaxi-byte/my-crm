import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { enrichComparisonRow, isComparableRide, isTopProblematicDriverPriceHigher } from "../lib/driver-price-comparison/calculated-fields";
import { sortComparisonRows } from "../lib/driver-price-comparison/table-sort";

describe("driver price comparison table", () => {
  it("excludes no-price trips from comparable rows", () => {
    const row = enrichComparisonRow({
      order_id: "abc",
      order_date: "2026-03-15T08:30:00.000Z",
      driver_price_with_vat: 0,
      actual_km: null,
      actual_minutes: null,
      mone_price: 509.2,
    });
    assert.ok(row);
    assert.equal(row.difference_flag, "No price");
    assert.equal(isComparableRide(row), false);
  });

  it("requires driver price higher problematic rides to exceed 10 nis", () => {
    const smallDiff = enrichComparisonRow({
      order_id: "small",
      order_date: "2026-03-15T08:30:00.000Z",
      driver_price_with_vat: 105,
      actual_km: 12,
      actual_minutes: 25,
      mone_price: 100,
    });
    const largeDiff = enrichComparisonRow({
      order_id: "large",
      order_date: "2026-03-15T08:30:00.000Z",
      driver_price_with_vat: 120,
      actual_km: 12,
      actual_minutes: 25,
      mone_price: 100,
    });

    assert.ok(smallDiff);
    assert.ok(largeDiff);
    assert.equal(isTopProblematicDriverPriceHigher(smallDiff), false);
    assert.equal(isTopProblematicDriverPriceHigher(largeDiff), true);
  });

  it("sorts rows by selected column", () => {
    const rows = [
      enrichComparisonRow({
        order_id: "b",
        order_date: "2026-03-16T08:30:00.000Z",
        driver_price_with_vat: 120,
        actual_km: 12,
        actual_minutes: 25,
        mone_price: 110,
      }),
      enrichComparisonRow({
        order_id: "a",
        order_date: "2026-03-15T08:30:00.000Z",
        driver_price_with_vat: 100,
        actual_km: 8,
        actual_minutes: 20,
        mone_price: 100,
      }),
    ].filter((row): row is NonNullable<typeof row> => row !== null);

    const sorted = sortComparisonRows(rows, "orderId", "asc");
    assert.deepEqual(sorted.map((row) => row.order_id), ["a", "b"]);
  });
});
