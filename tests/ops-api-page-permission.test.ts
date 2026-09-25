import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  PERMISSION_DENIED_CODE,
  PERMISSION_STORE_UNAVAILABLE_CODE,
  PermissionStoreUnavailableError,
} from "@/lib/permission-store-errors";
import {
  __setPermissionStoreLoaderForTests,
  guardOpsApiPagePermission,
  isEnforceOpsApiPermissions,
  userHasOpsPagePermission,
} from "@/lib/ops-api-page-permission";
import { makeOpsApiPermissionTestStore } from "@/tests/ops-api-permission-test-store";
import { type AuthUser } from "@/types/auth";

const baseUser: AuthUser = {
  id: "user-test-1",
  name: "Test User",
  email: "test@appli.taxi",
  password: "",
  role: "User",
  status: "approved",
  createdAt: new Date().toISOString(),
  accountType: "internal",
};

describe("ops API page permissions", () => {
  afterEach(() => {
    __setPermissionStoreLoaderForTests(null);
  });

  it("defaults to log-only (enforce off)", () => {
    assert.equal(isEnforceOpsApiPermissions(), false);
  });

  it("User role has requestRides by default", async () => {
    __setPermissionStoreLoaderForTests(async () => makeOpsApiPermissionTestStore());
    assert.equal(await userHasOpsPagePermission(baseUser, "requestRides"), true);
  });

  it("guard passes through when enforce off even if permission missing", async () => {
    const prev = process.env.ENFORCE_OPS_API_PERMISSIONS;
    process.env.ENFORCE_OPS_API_PERMISSIONS = "false";
    __setPermissionStoreLoaderForTests(async () =>
      makeOpsApiPermissionTestStore({ User: { requestRides: false } }),
    );
    const res = await guardOpsApiPagePermission(
      baseUser,
      new Request("http://localhost/api/request-rides-create", { method: "POST" }),
      "requestRides",
    );
    if (prev === undefined) delete process.env.ENFORCE_OPS_API_PERMISSIONS;
    else process.env.ENFORCE_OPS_API_PERMISSIONS = prev;
    assert.equal(res, null);
  });

  it("guard returns 403 when enforce on and permission denied", async () => {
    const prev = process.env.ENFORCE_OPS_API_PERMISSIONS;
    process.env.ENFORCE_OPS_API_PERMISSIONS = "true";
    __setPermissionStoreLoaderForTests(async () =>
      makeOpsApiPermissionTestStore({ User: { requestRides: false } }),
    );
    const res = await guardOpsApiPagePermission(
      baseUser,
      new Request("http://localhost/api/request-rides-create", { method: "POST" }),
      "requestRides",
    );
    if (prev === undefined) delete process.env.ENFORCE_OPS_API_PERMISSIONS;
    else process.env.ENFORCE_OPS_API_PERMISSIONS = prev;
    assert.ok(res);
    assert.equal(res!.status, 403);
    const body = await res!.json();
    assert.equal(body.error.code, PERMISSION_DENIED_CODE);
  });

  it("log-only continues when permission store is unavailable", async () => {
    __setPermissionStoreLoaderForTests(async () => {
      throw new PermissionStoreUnavailableError();
    });
    const prev = process.env.ENFORCE_OPS_API_PERMISSIONS;
    process.env.ENFORCE_OPS_API_PERMISSIONS = "false";
    const res = await guardOpsApiPagePermission(
      baseUser,
      new Request("http://localhost/api/request-rides-create", { method: "POST" }),
      "requestRides",
    );
    if (prev === undefined) delete process.env.ENFORCE_OPS_API_PERMISSIONS;
    else process.env.ENFORCE_OPS_API_PERMISSIONS = prev;
    assert.equal(res, null);
  });

  it("returns 503 when permission store is unavailable and enforce is on", async () => {
    __setPermissionStoreLoaderForTests(async () => {
      throw new PermissionStoreUnavailableError();
    });
    const prev = process.env.ENFORCE_OPS_API_PERMISSIONS;
    process.env.ENFORCE_OPS_API_PERMISSIONS = "true";
    const res = await guardOpsApiPagePermission(
      baseUser,
      new Request("http://localhost/api/request-rides-create", { method: "POST" }),
      "requestRides",
    );
    if (prev === undefined) delete process.env.ENFORCE_OPS_API_PERMISSIONS;
    else process.env.ENFORCE_OPS_API_PERMISSIONS = prev;
    assert.ok(res);
    assert.equal(res!.status, 503);
    const body = await res!.json();
    assert.equal(body.error.code, PERMISSION_STORE_UNAVAILABLE_CODE);
    assert.equal(body.error.nothingSent, true);
  });

  it("request-rides-create runs permission guard before body parse", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/request-rides-create/route.ts"),
      "utf8",
    );
    const postIdx = src.indexOf("export async function POST");
    assert.ok(postIdx > 0);
    const postBody = src.slice(postIdx);
    const guardIdx = postBody.indexOf("guardOpsApiPagePermission");
    const parseIdx = postBody.indexOf("request.json()");
    const createIdx = postBody.indexOf("await createRequestRide");
    assert.ok(guardIdx > 0, "guard present in POST");
    assert.ok(parseIdx > guardIdx, "guard before body parse");
    assert.ok(createIdx > guardIdx, "guard before createRequestRide call");
  });
});
