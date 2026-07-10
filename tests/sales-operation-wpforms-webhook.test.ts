import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  getWpformsWebhookSecret,
  isWpformsWebhookAuthorized,
} from "@/lib/sales-operation/wpforms-webhook-auth";
import { mapWpformsPayloadToLeadInput } from "@/lib/sales-operation/wpforms-webhook-mapper";

describe("wpforms webhook auth", () => {
  const original = process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET;
    } else {
      process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET = original;
    }
  });

  it("rejects when secret is not configured", () => {
    delete process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET;
    const request = new Request("https://example.com", {
      headers: { "X-Webhook-Secret": "anything" },
    });
    assert.equal(getWpformsWebhookSecret(), null);
    assert.equal(isWpformsWebhookAuthorized(request), false);
  });

  it("accepts X-Webhook-Secret header", () => {
    process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET = "test-secret-123";
    const request = new Request("https://example.com", {
      headers: { "X-Webhook-Secret": "test-secret-123" },
    });
    assert.equal(isWpformsWebhookAuthorized(request), true);
  });

  it("accepts Authorization Bearer token", () => {
    process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET = "test-secret-123";
    const request = new Request("https://example.com", {
      headers: { Authorization: "Bearer test-secret-123" },
    });
    assert.equal(isWpformsWebhookAuthorized(request), true);
  });

  it("rejects wrong secret", () => {
    process.env.SALES_OPERATION_WPFORMS_WEBHOOK_SECRET = "test-secret-123";
    const request = new Request("https://example.com", {
      headers: { "X-Webhook-Secret": "wrong" },
    });
    assert.equal(isWpformsWebhookAuthorized(request), false);
  });
});

describe("wpforms webhook mapper", () => {
  it("maps name and standard fields with wordpress source", () => {
    const { input, submissionId } = mapWpformsPayloadToLeadInput({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "+972500000000",
      company: "Analytical Engines",
      campaignName: "WordPress Landing",
      form_id: "42",
      entry_id: "wp-1001",
      message: "Hello",
    });

    assert.equal(submissionId, "wp-1001");
    assert.equal(input.fullName, "Ada Lovelace");
    assert.equal(input.email, "ada@example.com");
    assert.equal(input.phone, "+972500000000");
    assert.equal(input.companyName, "Analytical Engines");
    assert.equal(input.campaignName, "WordPress Landing");
    assert.equal(input.formId, "42");
    assert.equal(input.source, "wordpress");
    assert.equal(input.status, "new");
    assert.equal(input.customFields.wpforms_submission_id, "wp-1001");
    assert.equal(input.customFields.message, "Hello");
  });

  it("builds fullName from first and last name", () => {
    const { input } = mapWpformsPayloadToLeadInput({
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
    });
    assert.equal(input.fullName, "Ada Lovelace");
  });

  it("throws when fullName cannot be resolved", () => {
    assert.throws(
      () => mapWpformsPayloadToLeadInput({ email: "only@example.com" }),
      /fullName is required/,
    );
  });

  it("stores submission_id alias in custom fields", () => {
    const { submissionId, input } = mapWpformsPayloadToLeadInput({
      fullName: "Test User",
      submissionId: "sub-99",
    });
    assert.equal(submissionId, "sub-99");
    assert.equal(input.customFields.wpforms_submission_id, "sub-99");
  });

  it("maps nested WPForms fields array", () => {
    const { input, submissionId } = mapWpformsPayloadToLeadInput({
      form_id: "42",
      entry_id: "wp-2001",
      fields: [
        { name: "Name", value: "Ada Lovelace" },
        { name: "Email", value: "ada@example.com" },
        { name: "Phone", value: "+972500000001" },
      ],
    });

    assert.equal(submissionId, "wp-2001");
    assert.equal(input.fullName, "Ada Lovelace");
    assert.equal(input.email, "ada@example.com");
    assert.equal(input.phone, "+972500000001");
    assert.equal(input.source, "wordpress");
  });

  it("maps WPForms name field object with first and last", () => {
    const { input } = mapWpformsPayloadToLeadInput({
      fields: {
        "1": {
          name: "Name",
          value: { first: "Ada", last: "Lovelace" },
        },
      },
      entry_id: "wp-2002",
    });
    assert.equal(input.fullName, "Ada Lovelace");
  });

  it("unwraps Automator data envelope", () => {
    const { input } = mapWpformsPayloadToLeadInput({
      data: {
        fullName: "Envelope Lead",
        email: "env@example.com",
      },
    });
    assert.equal(input.fullName, "Envelope Lead");
    assert.equal(input.email, "env@example.com");
  });

  it("maps Elementor Automator payload with phonenumber and Company", () => {
    const { input } = mapWpformsPayloadToLeadInput({
      fullName: "Business Contact",
      Company: "Acme Ltd",
      email: "biz@example.com",
      phonenumber: "+972501112233",
      Form: "yango-business",
      source: "google",
      medium: "cpc",
      campaign: "brand",
    });

    assert.equal(input.fullName, "Business Contact");
    assert.equal(input.companyName, "Acme Ltd");
    assert.equal(input.email, "biz@example.com");
    assert.equal(input.phone, "+972501112233");
    assert.equal(input.formId, "yango-business");
    assert.equal(input.campaignName, "google / cpc / brand");
  });
});
