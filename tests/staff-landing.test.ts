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

describe("staff landing before/after P0-1 KV grant", () => {
  it("User before grant: legacy dashboard (not My Space no-access trap)", () => {
    const canAccess = canAccessFromStored("User", {});
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      "/dashboard",
    );
  });

  it("User after grant: My Space via STAFF_MY_SPACE_PATH", () => {
    const canAccess = canAccessFromStored("User", {
      salesOperation: true,
      salesMySpace: true,
    });
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      STAFF_MY_SPACE_PATH,
    );
  });

  it("Team Lead before grant: legacy landing", () => {
    const canAccess = canAccessFromStored("Team Lead", {});
    assert.equal(
      resolveAuthenticatedLandingPath({ accountType: "internal", canAccess }),
      "/dashboard",
    );
  });

  it("Team Lead after grant: My Space", () => {
    const canAccess = canAccessFromStored("Team Lead", {
      salesOperation: true,
      salesMySpace: true,
    });
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

  it("resolvePostLoginPathForUser matches grant state in auth store", () => {
    const storeBefore = {
      users: [],
      rolePermissions: defaultRolePermissions,
      roleAreaAccess: {} as AuthStoreData["roleAreaAccess"],
      roleDashboardBlockAccess: {} as AuthStoreData["roleDashboardBlockAccess"],
      storeMeta: { permissionsVersion: 18 },
    } as AuthStoreData;
    assert.equal(
      resolvePostLoginPathForUser(storeBefore, {
        role: "User",
        accountType: "internal",
        status: "approved",
      }),
      "/dashboard",
    );

    const storeAfter = {
      ...storeBefore,
      rolePermissions: {
        ...defaultRolePermissions,
        User: {
          ...defaultRolePermissions.User,
          salesOperation: true,
          salesMySpace: true,
        },
      },
    } as AuthStoreData;
    assert.equal(
      resolvePostLoginPathForUser(storeAfter, {
        role: "User",
        accountType: "internal",
        status: "approved",
      }),
      STAFF_MY_SPACE_PATH,
    );
  });
});
