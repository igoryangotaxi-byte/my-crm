import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PERMISSION_DENIED_CODE,
  PERMISSION_STORE_UNAVAILABLE_CODE,
  classifyOpsApiPayload,
  isPermissionStoreUnavailable,
  permissionDeniedResponse,
  permissionStoreUnavailableResponse,
} from "@/lib/permission-store-errors";

describe("permission store error responses", () => {
  it("403 PERMISSION_DENIED shape", async () => {
    const res = permissionDeniedResponse();
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.deepEqual(body, { error: { code: PERMISSION_DENIED_CODE } });
  });

  it("503 PERMISSION_STORE_UNAVAILABLE shape", async () => {
    const res = permissionStoreUnavailableResponse();
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error.code, PERMISSION_STORE_UNAVAILABLE_CODE);
    assert.equal(body.error.nothingSent, true);
  });

  it("classifies store unavailable vs generic 503", () => {
    assert.equal(
      classifyOpsApiPayload(503, {
        error: { code: PERMISSION_STORE_UNAVAILABLE_CODE, nothingSent: true },
      }),
      "store_unavailable",
    );
    assert.equal(classifyOpsApiPayload(503, { error: "Server error" }), "unknown");
    assert.equal(
      isPermissionStoreUnavailable({ status: 503 } as Response, {
        error: { code: PERMISSION_STORE_UNAVAILABLE_CODE, nothingSent: true },
      }),
      true,
    );
  });
});
