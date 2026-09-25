import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveAuthenticatedLandingPath } from "@/lib/login-redirect";
import {
  mergeRolePermissions,
  STAFF_MY_SPACE_PATH,
  STAFF_NO_ACCESS_PATH,
} from "@/lib/role-permissions";
import { resolvePostLoginPathForUser } from "@/lib/sso/post-login-path";
import { defaultRolePermissions, type AuthStoreData } from "@/types/auth";

function canAccessFromStored(
  role: "User" | "Team Lead",
  stored: Partial<Record<string, boolean>>,
  version = 18,
) {
  const merged = mergeRolePermissions(role, stored, version);
  return (page: string) => Boolean(merged[page as keyof typeof merged]);
}

describe("staff landing with My Space code defaults", () => {
  it("User with empty stored overrides of role defaults lands on My Space", () => {
    const canAccess = canAccessFromStored("User", {});
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("User with explicit SO off stays on legacy dashboard", () => {
    const canAccess = canAccessFromStored("User", {
      salesOperation: false,
      salesMySpace: false,
    });
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      "/dashboard",
    );
  });

  it("Team Lead with defaults lands on My Space", () => {
    const canAccess = canAccessFromStored("Team Lead", {});
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("zero allowed pages lands on stable no-access (single hop from login resolver)", () => {
    const canAccess = () => false;
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      STAFF_NO_ACCESS_PATH,
    );
  });

  it("resolvePostLoginPathForUser uses code defaults (My Space for User)", () => {
    const store = {
      users: [],
      rolePermissions: defaultRolePermissions,
      roleAreaAccess: {} as AuthStoreData["roleAreaAccess"],
      roleDashboardBlockAccess: {} as AuthStoreData["roleDashboardBlockAccess"],
      storeMeta: { permissionsVersion: 18 },
    } as AuthStoreData;
    assert.equal(
      resolvePostLoginPathForUser(store, {
        role: "User",
        accountType: "internal",
        status: "approved",
      }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("resolvePostLoginPathForUser honors pageOverrides to grant Pipeline", () => {
    const store = {
      users: [],
      rolePermissions: defaultRolePermissions,
      roleAreaAccess: {} as AuthStoreData["roleAreaAccess"],
      roleDashboardBlockAccess: {} as AuthStoreData["roleDashboardBlockAccess"],
      storeMeta: { permissionsVersion: 18 },
    } as AuthStoreData;
    assert.equal(
      resolvePostLoginPathForUser(store, {
        role: "User",
        accountType: "internal",
        status: "approved",
        pageOverrides: { salesPipeline: true },
      }),
      STAFF_MY_SPACE_PATH,
    );
  });
});
