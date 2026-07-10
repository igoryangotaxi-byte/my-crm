import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeCorpClientId } from "@/lib/sales-operation/b2b-client-registry";

describe("sales operation client update helpers", () => {
  it("normalizes corp client ids", () => {
    assert.equal(normalizeCorpClientId("  ABC-123  "), "abc-123");
    assert.equal(normalizeCorpClientId(null), "");
    assert.equal(normalizeCorpClientId(undefined), "");
  });
});
