import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isPermissionStoreUnavailable } from "@/lib/permission-store-unavailable-client";
import {
  PERMISSION_STORE_UNAVAILABLE_CODE,
  permissionStoreUnavailableResponse,
} from "@/lib/permission-store-unavailable";

describe("permission store unavailable contract", () => {
  it("503 response uses PERMISSION_STORE_UNAVAILABLE and nothingSent", async () => {
    const response = permissionStoreUnavailableResponse();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.json();
    assert.equal(body.error.code, PERMISSION_STORE_UNAVAILABLE_CODE);
    assert.equal(body.error.nothingSent, true);
    assert.equal(
      isPermissionStoreUnavailable(new Response(null, { status: 503 }), body),
      true,
    );
  });

  it("does not treat generic 503 as permission store unavailable", () => {
    assert.equal(
      isPermissionStoreUnavailable(
        new Response(null, { status: 503 }),
        { ok: false, message: "other" },
      ),
      false,
    );
  });
});

describe("loadLegacyAuthStore read path", () => {
  it("does not call kv.set in loadLegacyAuthStore source", () => {
    const { readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const source = readFileSync(join(process.cwd(), "lib/auth-store.ts"), "utf8");
    const fnStart = source.indexOf("async function loadLegacyAuthStore");
    assert.ok(fnStart >= 0);
    const fnBody = source.slice(fnStart, source.indexOf("async function saveLegacyAuthStore", fnStart));
    assert.doesNotMatch(fnBody, /\.set\s*\(/);
  });
});
