import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { maskSensitiveLogText, stringifyOpsApiPermissionLog } from "@/lib/ops-api-audit-log";

describe("ops API audit log masking", () => {
  it("masks phone numbers and token-like strings", () => {
    const raw =
      'user +972501234567 token ya_live_abcdef123456789 Bearer sk-abc123456789012345678 YANGO_TOKEN_TEST=secret';
    const masked = maskSensitiveLogText(raw);
    assert.equal(masked.includes("+972501234567"), false);
    assert.equal(masked.includes("sk-abc"), false);
    assert.equal(masked.includes("secret"), false);
    assert.match(masked, /\[redacted-phone\]/);
    assert.match(masked, /\[redacted-token\]/);
  });

  it("stringifyOpsApiPermissionLog never leaks phones from payload fields", () => {
    const line = stringifyOpsApiPermissionLog({
      kind: "ops_api_permission_would_deny",
      note: "call +972521234567",
      tokenLabel: "TEST CABINET",
    });
    assert.equal(line.includes("+972521234567"), false);
    assert.match(line, /ops_api_permission_would_deny/);
  });
});
