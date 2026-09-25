import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapDriversWebhookPayloadToLeadInput } from "../lib/drivers-pipeline/webhook-mapper";
import { isDriverLeadStatus } from "../lib/drivers-pipeline/status-transitions";
import { DRIVER_LEAD_STATUSES } from "../lib/drivers-pipeline/types";

describe("drivers pipeline webhook mapper", () => {
  it("maps Elementor-style payload to New wordpress lead", () => {
    const { input, submissionId } = mapDriversWebhookPayloadToLeadInput({
      fullName: "Test Driver",
      email: "d@example.com",
      phone: "0501234567",
      formId: "3684f71",
      submissionId: "elementor-drivers-test-1",
    });
    assert.equal(input.fullName, "Test Driver");
    assert.equal(input.status, "new");
    assert.equal(input.source, "wordpress");
    assert.equal(input.formId, "3684f71");
    assert.equal(submissionId, "elementor-drivers-test-1");
    assert.equal(input.customFields?.submission_id, "elementor-drivers-test-1");
  });

  it("requires fullName", () => {
    assert.throws(
      () => mapDriversWebhookPayloadToLeadInput({ email: "x@y.com" }),
      /fullName is required/,
    );
  });
});

describe("driver lead statuses", () => {
  it("accepts the four pipeline statuses", () => {
    for (const status of DRIVER_LEAD_STATUSES) {
      assert.equal(isDriverLeadStatus(status), true);
    }
    assert.equal(isDriverLeadStatus("signed"), false);
  });
});
