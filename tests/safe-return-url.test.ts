import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeSameOriginReturnPath } from "@/lib/safe-return-url";

describe("sanitizeSameOriginReturnPath", () => {
  it("accepts safe relative paths", () => {
    assert.equal(sanitizeSameOriginReturnPath("/sales-operation/pipeline"), "/sales-operation/pipeline");
    assert.equal(
      sanitizeSameOriginReturnPath("/sales-operation/tasks?task=1"),
      "/sales-operation/tasks?task=1",
    );
  });

  it("rejects open redirects", () => {
    assert.equal(sanitizeSameOriginReturnPath("https://evil.test"), null);
    assert.equal(sanitizeSameOriginReturnPath("//evil.test/path"), null);
    assert.equal(sanitizeSameOriginReturnPath("http://evil.test"), null);
    assert.equal(sanitizeSameOriginReturnPath("../admin"), null);
  });
});
