import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeWeightedPipelineValue,
  defaultPipelineStages,
  SALES_STATUS_COLUMNS,
} from "@/lib/sales-operation/display";
import { isValidStatusTransition } from "@/lib/sales-operation/status-transitions";
import {
  SALES_LEAD_COMPAT_STATUSES,
  SALES_LEAD_STATUSES,
} from "@/lib/sales-operation/types";

describe("sales operation pipeline config (Phase 1)", () => {
  it("includes negotiation as a status between proposal_sent and signed", () => {
    assert.ok((SALES_LEAD_STATUSES as readonly string[]).includes("negotiation"));
    const order = SALES_LEAD_STATUSES.indexOf("negotiation");
    assert.ok(order > SALES_LEAD_STATUSES.indexOf("proposal_sent"));
    assert.ok(order < SALES_LEAD_STATUSES.indexOf("signed"));
  });

  it("treats proposal_sent and negotiation as compat statuses", () => {
    assert.deepEqual([...SALES_LEAD_COMPAT_STATUSES], ["proposal_sent", "negotiation"]);
  });

  it("exposes a board column for every status", () => {
    for (const status of SALES_LEAD_STATUSES) {
      assert.ok(
        SALES_STATUS_COLUMNS.some((column) => column.status === status),
        `missing column for ${status}`,
      );
    }
  });

  it("negotiation is a non-terminal stage that can move forward or back", () => {
    assert.equal(isValidStatusTransition("proposal_sent", "negotiation"), true);
    assert.equal(isValidStatusTransition("negotiation", "signed"), true);
    assert.equal(isValidStatusTransition("negotiation", "in_progress"), true);
    assert.equal(isValidStatusTransition("signed", "negotiation"), false);
  });

  it("seeds default stages with expected win/lost/terminal flags", () => {
    const stages = defaultPipelineStages();
    const byKey = Object.fromEntries(stages.map((stage) => [stage.key, stage]));
    assert.equal(byKey.signed.isWon, true);
    assert.equal(byKey.signed.isTerminal, true);
    assert.equal(byKey.rejected.isLost, true);
    assert.equal(byKey.negotiation.probability, 70);
  });

  it("computes weighted value from potential and probability", () => {
    // Uses stage default probability when no override.
    assert.equal(
      computeWeightedPipelineValue({
        estimatedMonthlyPotential: 1000,
        probabilityOverride: null,
        status: "negotiation",
      }),
      700,
    );
    // Explicit override wins.
    assert.equal(
      computeWeightedPipelineValue({
        estimatedMonthlyPotential: 1000,
        probabilityOverride: 25,
        status: "new",
      }),
      250,
    );
    // No potential → zero.
    assert.equal(
      computeWeightedPipelineValue({
        estimatedMonthlyPotential: null,
        probabilityOverride: 50,
        status: "new",
      }),
      0,
    );
  });
});
