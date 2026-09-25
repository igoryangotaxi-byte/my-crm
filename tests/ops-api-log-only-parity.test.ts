import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { PermissionStoreUnavailableError } from "@/lib/permission-store-errors";
import {
  __setPermissionStoreLoaderForTests,
  guardOpsApiPagePermission,
} from "@/lib/ops-api-page-permission";
import { makeOpsApiPermissionTestStore } from "@/tests/ops-api-permission-test-store";
import type { AuthUser } from "@/types/auth";

const user: AuthUser = {
  id: "user-test-1",
  name: "Test",
  email: "test@appli.taxi",
  password: "",
  role: "User",
  status: "approved",
  createdAt: new Date().toISOString(),
  accountType: "internal",
};

describe("ops API log-only parity (ENFORCE off = main behavior)", () => {
  afterEach(() => {
    __setPermissionStoreLoaderForTests(null);
    mock.restoreAll();
  });

  it("returns null (no 403/503) when enforce off for deny and store outage", async () => {
    const prev = process.env.ENFORCE_OPS_API_PERMISSIONS;
    process.env.ENFORCE_OPS_API_PERMISSIONS = "false";

    __setPermissionStoreLoaderForTests(async () =>
      makeOpsApiPermissionTestStore({ User: { requestRides: false } }),
    );
    const denied = await guardOpsApiPagePermission(
      user,
      new Request("http://localhost/api/request-rides-create", { method: "POST" }),
      "requestRides",
    );
    assert.equal(denied, null);

    __setPermissionStoreLoaderForTests(async () => {
      throw new PermissionStoreUnavailableError();
    });
    const storeOutage = await guardOpsApiPagePermission(
      user,
      new Request("http://localhost/api/request-rides-create", { method: "POST" }),
      "requestRides",
    );
    assert.equal(storeOutage, null);

    if (prev === undefined) delete process.env.ENFORCE_OPS_API_PERMISSIONS;
    else process.env.ENFORCE_OPS_API_PERMISSIONS = prev;
  });

  it("log lines contain no phone numbers or API tokens", async () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(" "));
    };
    try {
      const prev = process.env.ENFORCE_OPS_API_PERMISSIONS;
      process.env.ENFORCE_OPS_API_PERMISSIONS = "false";
      __setPermissionStoreLoaderForTests(async () =>
        makeOpsApiPermissionTestStore({ User: { requestRides: false } }),
      );
      await guardOpsApiPagePermission(
        {
          ...user,
          email: "rider+972501234567@appli.taxi",
        },
        new Request("http://localhost/api/request-rides-create?phone=%2B972501234567", {
          method: "POST",
        }),
        "requestRides",
      );
      if (prev === undefined) delete process.env.ENFORCE_OPS_API_PERMISSIONS;
      else process.env.ENFORCE_OPS_API_PERMISSIONS = prev;

      assert.ok(warnings.length > 0);
      for (const line of warnings) {
        assert.equal(line.includes("+972501234567"), false);
        assert.equal(/ya[_-]?live/i.test(line), false);
        assert.equal(line.includes("Bearer "), false);
      }
    } finally {
      console.warn = original;
    }
  });
});
