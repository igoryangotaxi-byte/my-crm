import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getOrdersStatusDisplay, resolveOrdersStatusBucket } from "@/lib/orders/lifecycle-status";

describe("orders lifecycle status", () => {
  const now = Date.parse("2026-08-29T12:00:00+03:00");

  it("maps transporting_finished to completed (not in_progress)", () => {
    assert.equal(
      resolveOrdersStatusBucket(
        { statusRaw: "transporting_finished", scheduledAt: "2026-08-29T11:00:00+03:00" },
        now,
      ),
      "completed",
    );
  });

  it("maps transporting / waiting / driving to in_progress", () => {
    for (const statusRaw of ["transporting", "waiting", "driving", "arrived", "pickup"]) {
      assert.equal(
        resolveOrdersStatusBucket(
          { statusRaw, scheduledAt: "2026-08-29T11:00:00+03:00" },
          now,
        ),
        "in_progress",
        statusRaw,
      );
    }
  });

  it("maps cancel* to cancelled", () => {
    assert.equal(
      resolveOrdersStatusBucket(
        { statusRaw: "cancelled", scheduledAt: "2026-08-29T11:00:00+03:00" },
        now,
      ),
      "cancelled",
    );
  });

  it("shows raw Yango status on in-progress label", () => {
    const display = getOrdersStatusDisplay(
      { statusRaw: "transporting", scheduledAt: "2026-08-29T11:00:00+03:00" },
      now,
    );
    assert.equal(display.bucket, "in_progress");
    assert.match(display.label, /transporting/i);
  });
});
