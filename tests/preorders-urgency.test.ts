import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPreOrderUrgencyLabel,
  getPreOrderUrgencyLevel,
  minutesUntilScheduled,
  PREORDER_URGENCY_RED_MAX_MINUTES,
  PREORDER_URGENCY_YELLOW_MAX_MINUTES,
} from "@/lib/preorders/urgency";

describe("preorder urgency", () => {
  const now = Date.parse("2026-08-27T12:00:00+03:00");

  it("returns green when driver is assigned", () => {
    const level = getPreOrderUrgencyLevel(
      {
        driverAssigned: true,
        orderStatus: "scheduling",
        scheduledAt: "2026-08-27T12:05:00+03:00",
      },
      now,
    );
    assert.equal(level, "green");
  });

  it("returns red under 10 minutes unassigned", () => {
    const level = getPreOrderUrgencyLevel(
      {
        driverAssigned: false,
        orderStatus: "scheduling",
        scheduledAt: "2026-08-27T12:09:00+03:00",
      },
      now,
    );
    assert.equal(level, "red");
    assert.equal(PREORDER_URGENCY_RED_MAX_MINUTES, 10);
  });

  it("returns yellow between 10 and 30 minutes unassigned", () => {
    const level = getPreOrderUrgencyLevel(
      {
        driverAssigned: false,
        orderStatus: "scheduling",
        scheduledAt: "2026-08-27T12:20:00+03:00",
      },
      now,
    );
    assert.equal(level, "yellow");
    assert.equal(PREORDER_URGENCY_YELLOW_MAX_MINUTES, 30);
  });

  it("returns neutral over 30 minutes unassigned", () => {
    const level = getPreOrderUrgencyLevel(
      {
        driverAssigned: false,
        orderStatus: "scheduling",
        scheduledAt: "2026-08-27T13:00:00+03:00",
      },
      now,
    );
    assert.equal(level, "neutral");
  });

  it("returns yellow at exact 10 and 30 minute boundaries", () => {
    assert.equal(
      getPreOrderUrgencyLevel(
        {
          driverAssigned: false,
          orderStatus: "scheduling",
          scheduledAt: "2026-08-27T12:10:00+03:00",
        },
        now,
      ),
      "yellow",
    );
    assert.equal(
      getPreOrderUrgencyLevel(
        {
          driverAssigned: false,
          orderStatus: "scheduling",
          scheduledAt: "2026-08-27T12:30:00+03:00",
        },
        now,
      ),
      "yellow",
    );
  });

  it("treats overdue unassigned as red", () => {
    const level = getPreOrderUrgencyLevel(
      {
        driverAssigned: false,
        orderStatus: "scheduling",
        scheduledAt: "2026-08-27T11:50:00+03:00",
      },
      now,
    );
    assert.equal(level, "red");
    assert.match(
      getPreOrderUrgencyLabel(level, minutesUntilScheduled("2026-08-27T11:50:00+03:00", now)),
      /overdue/i,
    );
  });
});
