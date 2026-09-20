import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import {
  generateAstradialWebhookSignature,
  verifyAstradialWebhookSignature,
} from "@/lib/telephony/webhook-auth";
import { isTelephonyEnabled, getTelephonyProviderName } from "@/lib/telephony/env";
import { createAstradialTelephonyProvider } from "@/lib/telephony/providers/astradial";

describe("telephony env flag", () => {
  const keys = ["TELEPHONY_ENABLED", "TELEPHONY_PROVIDER"] as const;
  const prev: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of keys) prev[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of keys) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it("defaults to disabled", () => {
    delete process.env.TELEPHONY_ENABLED;
    assert.equal(isTelephonyEnabled(), false);
    assert.equal(getTelephonyProviderName(), "off");
  });

  it("enables astradial provider", () => {
    process.env.TELEPHONY_ENABLED = "true";
    process.env.TELEPHONY_PROVIDER = "astradial";
    assert.equal(isTelephonyEnabled(), true);
    assert.equal(getTelephonyProviderName(), "astradial");
  });
});

describe("Astradial webhook HMAC", () => {
  const prev = process.env.ASTRADIAL_WEBHOOK_SECRET;
  const prevUrl = process.env.ASTRADIAL_API_URL;
  const prevKey = process.env.ASTRADIAL_API_KEY;

  beforeEach(() => {
    process.env.ASTRADIAL_API_URL = "https://example.test";
    process.env.ASTRADIAL_API_KEY = "test-key";
    process.env.ASTRADIAL_WEBHOOK_SECRET = "whsec-test";
  });
  afterEach(() => {
    if (prev === undefined) delete process.env.ASTRADIAL_WEBHOOK_SECRET;
    else process.env.ASTRADIAL_WEBHOOK_SECRET = prev;
    if (prevUrl === undefined) delete process.env.ASTRADIAL_API_URL;
    else process.env.ASTRADIAL_API_URL = prevUrl;
    if (prevKey === undefined) delete process.env.ASTRADIAL_API_KEY;
    else process.env.ASTRADIAL_API_KEY = prevKey;
  });

  it("accepts a valid signature", () => {
    const rawBody = JSON.stringify({ id: "evt-1", event: "call.initiated", data: {} });
    const sig = generateAstradialWebhookSignature(rawBody, "whsec-test");
    const result = verifyAstradialWebhookSignature({
      rawBody,
      signatureHeader: sig,
      timestampHeader: new Date().toISOString(),
    });
    assert.equal(result.ok, true);
  });

  it("rejects a bad signature", () => {
    const rawBody = JSON.stringify({ id: "evt-1", event: "call.initiated", data: {} });
    const result = verifyAstradialWebhookSignature({
      rawBody,
      signatureHeader: "sha256=deadbeef",
      timestampHeader: new Date().toISOString(),
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 401);
  });

  it("fail-closes when secret missing", () => {
    delete process.env.ASTRADIAL_WEBHOOK_SECRET;
    const rawBody = "{}";
    const result = verifyAstradialWebhookSignature({
      rawBody,
      signatureHeader: "sha256=abc",
      timestampHeader: null,
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.status, 503);
  });
});

describe("AstradialTelephonyProvider shaping", () => {
  it("reports not configured without env", () => {
    const prevUrl = process.env.ASTRADIAL_API_URL;
    const prevKey = process.env.ASTRADIAL_API_KEY;
    delete process.env.ASTRADIAL_API_URL;
    delete process.env.ASTRADIAL_API_KEY;
    const provider = createAstradialTelephonyProvider();
    assert.equal(provider.isConfigured(), false);
    if (prevUrl === undefined) delete process.env.ASTRADIAL_API_URL;
    else process.env.ASTRADIAL_API_URL = prevUrl;
    if (prevKey === undefined) delete process.env.ASTRADIAL_API_KEY;
    else process.env.ASTRADIAL_API_KEY = prevKey;
  });
});
