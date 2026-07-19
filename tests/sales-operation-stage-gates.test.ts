import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  StageRequirementError,
  assertStageRequirements,
  isForwardTransition,
  validateStageRequirements,
} from "../lib/sales-operation/status-transitions.ts";

describe("sales operation stage gates", () => {
  it("detects forward transitions only", () => {
    assert.equal(isForwardTransition("new", "in_progress"), true);
    assert.equal(isForwardTransition("in_progress", "new"), false);
    assert.equal(isForwardTransition("proposal_sent", "rejected"), false);
  });

  it("requires contact + potential for in_progress", () => {
    assert.deepEqual(
      validateStageRequirements("new", "in_progress", {
        hasContact: false,
        estimatedMonthlyPotential: null,
      }),
      ["contact", "estimatedMonthlyPotential"],
    );
    assert.deepEqual(
      validateStageRequirements("new", "in_progress", {
        hasContact: true,
        estimatedMonthlyPotential: 5000,
      }),
      [],
    );
  });

  it("requires pricing proposal for proposal_sent", () => {
    assert.ok(
      validateStageRequirements("in_progress", "proposal_sent", {
        hasContact: true,
        estimatedMonthlyPotential: 1000,
        pricingProposal: "",
      }).includes("pricingProposal"),
    );
    assert.deepEqual(
      validateStageRequirements("in_progress", "proposal_sent", {
        hasContact: true,
        estimatedMonthlyPotential: 1000,
        pricingProposal: "Tier A pricing",
      }),
      [],
    );
  });

  it("requires follow-up task when entering negotiation", () => {
    assert.ok(
      validateStageRequirements("proposal_sent", "negotiation", {
        hasContact: true,
        estimatedMonthlyPotential: 1000,
        pricingProposal: "Offer",
        followUpTaskProvided: false,
      }).includes("followUpTask"),
    );
    assert.equal(
      validateStageRequirements("proposal_sent", "negotiation", {
        hasContact: true,
        estimatedMonthlyPotential: 1000,
        pricingProposal: "Offer",
        followUpTaskProvided: true,
      }).includes("followUpTask"),
      false,
    );
  });

  it("requires contract or corp id + account manager for signed", () => {
    const missing = validateStageRequirements("negotiation", "signed", {
      hasContact: true,
      estimatedMonthlyPotential: 1000,
      pricingProposal: "Offer",
      followUpTaskProvided: true,
      contractNumber: null,
      corpClientId: null,
      accountManagerUserId: null,
    });
    assert.ok(missing.includes("contractOrClientId"));
    assert.ok(missing.includes("accountManager"));

    assert.deepEqual(
      validateStageRequirements("negotiation", "signed", {
        hasContact: true,
        estimatedMonthlyPotential: 1000,
        pricingProposal: "Offer",
        contractNumber: "C-100",
        accountManagerUserId: "am-1",
      }),
      [],
    );
  });

  it("skips commercial gates on backward or rejected moves", () => {
    assert.deepEqual(
      validateStageRequirements("negotiation", "in_progress", {
        estimatedMonthlyPotential: null,
        hasContact: false,
      }),
      [],
    );
    assert.deepEqual(
      validateStageRequirements("negotiation", "rejected", {
        estimatedMonthlyPotential: null,
      }),
      [],
    );
  });

  it("throws structured StageRequirementError", () => {
    assert.throws(
      () =>
        assertStageRequirements("new", "in_progress", {
          hasContact: false,
          estimatedMonthlyPotential: 0,
        }),
      (error: unknown) => {
        assert.ok(error instanceof StageRequirementError);
        assert.equal(error.name, "StageRequirementError");
        assert.ok(error.missing.some((item) => item.key === "contact"));
        assert.ok(error.missing.some((item) => item.key === "estimatedMonthlyPotential"));
        return true;
      },
    );
  });
});
