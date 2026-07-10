import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertValidStatusTransition,
  isValidStatusTransition,
} from "@/lib/sales-operation/status-transitions";

describe("sales operation status transitions", () => {
  it("allows staying on the same status", () => {
    assert.equal(isValidStatusTransition("new", "new"), true);
    assert.equal(isValidStatusTransition("signed", "signed"), true);
  });

  it("blocks signed or rejected directly from new", () => {
    assert.equal(isValidStatusTransition("new", "signed"), false);
    assert.equal(isValidStatusTransition("new", "rejected"), false);
    assert.throws(() => assertValidStatusTransition("new", "signed"), /Invalid status transition/);
    assert.throws(() => assertValidStatusTransition("new", "rejected"), /Invalid status transition/);
  });

  it("allows other moves from new", () => {
    assert.equal(isValidStatusTransition("new", "in_progress"), true);
    assert.equal(isValidStatusTransition("new", "proposal_sent"), true);
  });

  it("allows free movement between non-terminal statuses", () => {
    assert.equal(isValidStatusTransition("in_progress", "signed"), true);
    assert.equal(isValidStatusTransition("in_progress", "rejected"), true);
    assert.equal(isValidStatusTransition("in_progress", "proposal_sent"), true);
    assert.equal(isValidStatusTransition("in_progress", "new"), true);
    assert.equal(isValidStatusTransition("proposal_sent", "signed"), true);
    assert.equal(isValidStatusTransition("proposal_sent", "new"), true);
    assert.equal(isValidStatusTransition("rejected", "signed"), true);
    assert.equal(isValidStatusTransition("rejected", "proposal_sent"), true);
  });

  it("blocks changes from signed", () => {
    assert.equal(isValidStatusTransition("signed", "new"), false);
    assert.equal(isValidStatusTransition("signed", "rejected"), false);
    assert.throws(() => assertValidStatusTransition("signed", "new"), /Invalid status transition/);
  });
});
