import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getPipelineStatusOverride,
  isProposalSentUnsupportedError,
  withPipelineStatusOverride,
} from "@/lib/sales-operation/proposal-sent-compat";

describe("proposal sent compatibility", () => {
  it("stores and clears pipeline status override", () => {
    const withOverride = withPipelineStatusOverride({ city: "TLV" }, "proposal_sent");
    assert.equal(getPipelineStatusOverride(withOverride), "proposal_sent");
    assert.equal(withOverride.city, "TLV");

    const cleared = withPipelineStatusOverride(withOverride, null);
    assert.equal(getPipelineStatusOverride(cleared), null);
    assert.equal(cleared.city, "TLV");
  });

  it("detects status check constraint errors", () => {
    assert.equal(
      isProposalSentUnsupportedError(
        new Error(
          'new row for relation "sales_leads" violates check constraint "sales_leads_status_check"',
        ),
      ),
      true,
    );
    assert.equal(isProposalSentUnsupportedError(new Error("random failure")), false);
  });
});
