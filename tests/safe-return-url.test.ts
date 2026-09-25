import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeSameOriginReturnPath } from "@/lib/safe-return-url";

describe("sanitizeSameOriginReturnPath", () => {
  it("accepts safe relative paths with a single leading slash", () => {
    assert.equal(sanitizeSameOriginReturnPath("/sales-operation/pipeline"), "/sales-operation/pipeline");
    assert.equal(
      sanitizeSameOriginReturnPath("/sales-operation/tasks?task=1"),
      "/sales-operation/tasks?task=1",
    );
  });

  it("rejects absolute and protocol-relative URLs", () => {
    assert.equal(sanitizeSameOriginReturnPath("https://evil.test/path"), null);
    assert.equal(sanitizeSameOriginReturnPath("http://evil.test"), null);
    assert.equal(sanitizeSameOriginReturnPath("//evil.test/path"), null);
    assert.equal(sanitizeSameOriginReturnPath("/\\evil.test"), null);
  });

  it("rejects traversal and non-path prefixes", () => {
    assert.equal(sanitizeSameOriginReturnPath("../admin"), null);
    assert.equal(sanitizeSameOriginReturnPath("sales-operation/pipeline"), null);
  });

  it("rejects encoded open-redirect variants", () => {
    assert.equal(sanitizeSameOriginReturnPath("/%2f%2fevil.test"), null);
    assert.equal(sanitizeSameOriginReturnPath("%2f%2fevil.test"), null);
    assert.equal(sanitizeSameOriginReturnPath("/%5c%5cevil.test"), null);
    assert.equal(sanitizeSameOriginReturnPath("/%68%74%74%70%73%3a//evil.test"), null);
  });

  it("accepts benign encoded path segments", () => {
    assert.equal(
      sanitizeSameOriginReturnPath("/sales-operation/b2b-clients/corp/%7Bid%7D"),
      "/sales-operation/b2b-clients/corp/{id}",
    );
  });
});
